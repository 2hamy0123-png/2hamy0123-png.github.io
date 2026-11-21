import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { arrayUnion, deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const HASH = 'a'.repeat(64);
const WRONG = 'b'.repeat(64);
const sealed = { iv: 'x'.repeat(16), ct: 'ciphertext' };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-balance',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** A team "t1" with members u1 and u2 already in place. */
async function seedTeam(members = ['u1', 'u2']) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/t1'), { memberUids: members, joinHash: HASH, createdAt: Timestamp.now() });
  });
}

describe('creating a team', () => {
  it('lets a signed-in user create a team with only themselves', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1'], joinHash: HASH, createdAt: Timestamp.now() }));
  });
  it('refuses anonymous visitors without a session', async () => {
    await assertFails(setDoc(doc(anon(), 'teams/t1'), { memberUids: ['u1'], joinHash: HASH, createdAt: Timestamp.now() }));
  });
  it('refuses making someone else a member', async () => {
    await assertFails(setDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1', 'u9'], joinHash: HASH, createdAt: Timestamp.now() }));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u9'], joinHash: HASH, createdAt: Timestamp.now() }));
  });
  it('refuses a malformed hash or extra fields', async () => {
    await assertFails(setDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1'], joinHash: 'short', createdAt: Timestamp.now() }));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1'], joinHash: HASH, createdAt: Timestamp.now(), admin: true }));
  });
});

describe('reading', () => {
  it('lets members read and nobody else', async () => {
    await seedTeam();
    await assertSucceeds(getDoc(doc(as('u1'), 'teams/t1')));
    await assertFails(getDoc(doc(as('stranger'), 'teams/t1')));
    await assertFails(getDoc(doc(anon(), 'teams/t1')));
  });
});

describe('joining', () => {
  it('lets someone with the invite join', async () => {
    await seedTeam();
    const db = as('u3');
    await assertSucceeds(setDoc(doc(db, `teams/t1/joins/${HASH}_u3`), { uid: 'u3' }));
    await assertSucceeds(updateDoc(doc(db, 'teams/t1'), { memberUids: arrayUnion('u3') }));
    await assertSucceeds(getDoc(doc(db, 'teams/t1')));
  });

  it('refuses joining with only the team id (no proof)', async () => {
    await seedTeam();
    await assertFails(updateDoc(doc(as('u3'), 'teams/t1'), { memberUids: arrayUnion('u3') }));
  });

  it('refuses a proof built from the wrong hash', async () => {
    await seedTeam();
    await assertFails(setDoc(doc(as('u3'), `teams/t1/joins/${WRONG}_u3`), { uid: 'u3' }));
  });

  it('refuses using someone else’s proof', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u3'), `teams/t1/joins/${HASH}_u3`), { uid: 'u3' }));
    await assertFails(updateDoc(doc(as('u4'), 'teams/t1'), { memberUids: arrayUnion('u4') }));
    await assertFails(setDoc(doc(as('u4'), `teams/t1/joins/${HASH}_u3`), { uid: 'u3' }));
  });

  it('refuses adding another person in your place', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u3'), `teams/t1/joins/${HASH}_u3`), { uid: 'u3' }));
    await assertFails(updateDoc(doc(as('u3'), 'teams/t1'), { memberUids: arrayUnion('u9') }));
  });

  it('refuses a sixth member', async () => {
    await seedTeam(['u1', 'u2', 'u3', 'u4', 'u5']);
    await assertSucceeds(setDoc(doc(as('u6'), `teams/t1/joins/${HASH}_u6`), { uid: 'u6' }));
    await assertFails(updateDoc(doc(as('u6'), 'teams/t1'), { memberUids: arrayUnion('u6') }));
  });

  it('refuses changing the join hash while joining', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u3'), `teams/t1/joins/${HASH}_u3`), { uid: 'u3' }));
    await assertFails(updateDoc(doc(as('u3'), 'teams/t1'), { memberUids: arrayUnion('u3'), joinHash: WRONG }));
  });
});

describe('leaving and removing', () => {
  it('lets a member leave', async () => {
    await seedTeam(['u1', 'u2', 'u3']);
    await assertSucceeds(updateDoc(doc(as('u3'), 'teams/t1'), { memberUids: ['u1', 'u2'] }));
  });
  it('lets a member remove one other person', async () => {
    await seedTeam(['u1', 'u2', 'u3']);
    await assertSucceeds(updateDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1', 'u3'] }));
  });
  it('refuses removing two people at once or adding while removing', async () => {
    await seedTeam(['u1', 'u2', 'u3']);
    await assertFails(updateDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1'] }));
    await assertFails(updateDoc(doc(as('u1'), 'teams/t1'), { memberUids: ['u1', 'u2', 'u9'].slice(0, 2).concat(['u9']).slice(1) }));
  });
  it('refuses outsiders removing members', async () => {
    await seedTeam(['u1', 'u2', 'u3']);
    await assertFails(updateDoc(doc(as('stranger'), 'teams/t1'), { memberUids: ['u1', 'u2'] }));
  });
});

describe('day cards', () => {
  const card = (uid: string, date = '2026-11-17') => ({ ...sealed, uid, date });

  it('lets a member write only their own card, readable by the team', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-17_u1'), card('u1')));
    await assertSucceeds(getDoc(doc(as('u2'), 'teams/t1/days/2026-11-17_u1')));
    await assertFails(setDoc(doc(as('u2'), 'teams/t1/days/2026-11-17_u1'), card('u1')));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-17_u2'), card('u2')));
  });
  it('refuses a card whose id does not match its date and owner', async () => {
    await seedTeam();
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/days/other_u1'), card('u1')));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-18_u1'), card('u1', '2026-11-17')));
  });
  it('keeps outsiders out', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-17_u1'), card('u1')));
    await assertFails(getDoc(doc(as('stranger'), 'teams/t1/days/2026-11-17_u1')));
    await assertFails(setDoc(doc(as('stranger'), 'teams/t1/days/2026-11-17_stranger'), card('stranger')));
  });
  it('refuses plain-text fields and oversized data', async () => {
    await seedTeam();
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-17_u1'), { ...card('u1'), kcal: 1800 }));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/days/2026-11-17_u1'), { ...card('u1'), ct: 'x'.repeat(5000) }));
  });
});

describe('posts', () => {
  const post = (uid: string) => ({ ...sealed, uid, at: Timestamp.now() });

  it('lets members post and delete only their own', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/posts/p1'), post('u1')));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/posts/p2'), post('u2')));
    await assertFails(deleteDoc(doc(as('u2'), 'teams/t1/posts/p1')));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'teams/t1/posts/p1')));
  });
  it('refuses editing a post and outsiders posting', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/posts/p1'), post('u1')));
    await assertFails(updateDoc(doc(as('u1'), 'teams/t1/posts/p1'), { ct: 'edited' }));
    await assertFails(setDoc(doc(as('stranger'), 'teams/t1/posts/p9'), post('stranger')));
  });
});

describe('member profiles and nudges', () => {
  it('lets a member write only their own profile', async () => {
    await seedTeam();
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/members/u1'), sealed));
    await assertFails(setDoc(doc(as('u1'), 'teams/t1/members/u2'), sealed));
    await assertSucceeds(getDoc(doc(as('u2'), 'teams/t1/members/u1')));
    await assertFails(getDoc(doc(as('stranger'), 'teams/t1/members/u1')));
  });

  it('allows one nudge per person per day and never an edit', async () => {
    await seedTeam();
    const id = '2026-11-17_u1_u2';
    await assertSucceeds(setDoc(doc(as('u1'), `teams/t1/nudges/${id}`), { date: '2026-11-17', from: 'u1', to: 'u2' }));
    await assertFails(setDoc(doc(as('u1'), `teams/t1/nudges/${id}`), { date: '2026-11-17', from: 'u1', to: 'u2' }));
    await assertFails(setDoc(doc(as('u2'), 'teams/t1/nudges/2026-11-17_u1_u2x'), { date: '2026-11-17', from: 'u1', to: 'u2x' }));
    await assertSucceeds(setDoc(doc(as('u1'), 'teams/t1/nudges/2026-11-18_u1_u2'), { date: '2026-11-18', from: 'u1', to: 'u2' }));
  });
});

describe('everything else is closed', () => {
  it('denies other collections', async () => {
    await assertFails(setDoc(doc(as('u1'), 'users/u1'), { a: 1 }));
    await assertFails(getDoc(doc(as('u1'), 'users/u1')));
  });
});
