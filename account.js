/* Accounts (Firebase Authentication) and cloud progress (Cloud Firestore).
 * Data stored per user: users/{uid}/attempts/{attemptId} — scenario id, grade, outcome, time,
 * critical actions done/missed, harm and hint counts. Nothing else. */
const S = (window.Sim = window.Sim || {});
const P = S.Progress;
const cfg = window.CRASHCALL_FIREBASE || {};
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const V = 'https://www.gstatic.com/firebasejs/10.12.2/';
if (P && cfg.apiKey) {
  // Firebase is only downloaded when accounts are configured.
  const [{ initializeApp }, A, F] = await Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-auth.js'), import(V + 'firebase-firestore.js')]);
  const { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut, deleteUser } = A;
  const { getFirestore, collection, doc, setDoc, getDocs, query, orderBy, limit, writeBatch } = F;
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const col = (uid) => collection(db, 'users', uid, 'attempts');
  const clean = (r) => JSON.parse(JSON.stringify(r)); // drop undefined values

  P.enabled = true;
  P.remote = {
    add: (rec) => setDoc(doc(col(auth.currentUser.uid), rec.rid), clean(rec)),
    list: async () => (await getDocs(query(col(auth.currentUser.uid), orderBy('at'), limit(3000)))).docs.map((d) => d.data()),
    removeAll: async () => {
      const uid = auth.currentUser.uid;
      for (;;) {
        const snap = await getDocs(query(col(uid), limit(400)));
        if (snap.empty) break;
        const b = writeBatch(db); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
      }
    },
  };

  const MSG = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account with that email — choose “Create account”.',
    'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
    'auth/weak-password': 'Password needs at least 6 characters.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Enter a password.',
    'auth/popup-closed-by-user': 'Sign-in window closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in pop-up — allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'This web address isn’t authorised for sign-in yet (Firebase → Authentication → Settings → Authorized domains).',
    'auth/too-many-requests': 'Too many attempts — wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection — check your internet and try again.',
    'auth/requires-recent-login': 'For security, sign out, sign back in, then delete your account.',
  };
  const say = (e) => MSG[e && e.code] || (e && e.message) || 'Something went wrong.';
  const toast = (m) => { if (S.ui && S.ui.toast) S.ui.toast(m); };

  let mode = 'signin'; // signin | create | reset
  let confirmDelete = false;

  function html() {
    const u = P.user;
    if (u) {
      return `<div class="acct">
        <p>Signed in as <b>${esc(u.name || u.email)}</b>${u.name && u.email ? ` <span class="muted small">(${esc(u.email)})</span>` : ''}.</p>
        <p class="muted small">Every scenario you finish is saved to your account, on any device.</p>
        <div class="row-btns"><button class="btn primary" data-a="progress">📈 My progress</button><button class="btn" data-a="signout">Sign out</button></div>
        <details class="acct-danger"><summary>Delete my account</summary>
          <p class="small">This permanently deletes your account and all saved progress. It can’t be undone.</p>
          <button class="btn danger" data-a="delete">${confirmDelete ? 'Click again to confirm deletion' : 'Delete account and data'}</button>
        </details>
        <p class="acct-msg small" role="status"></p>
      </div>`;
    }
    const create = mode === 'create', reset = mode === 'reset';
    return `<div class="acct">
      <p class="muted small">Sign in to save your results and see your progress on any device. You can keep playing without an account — progress is then kept on this device only.</p>
      ${reset ? '' : `<button class="btn acct-google" data-a="google"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continue with Google</button>
      <div class="acct-or"><span>or with email</span></div>`}
      <form class="acct-form" data-form>
        ${create ? '<label>Name <input name="name" autocomplete="name" maxlength="60" placeholder="e.g. Ben"></label>' : ''}
        <label>Email <input name="email" type="email" autocomplete="email" required></label>
        ${reset ? '' : `<label>Password <input name="pw" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" minlength="6" required></label>`}
        <button class="btn primary" type="submit">${create ? 'Create account' : reset ? 'Send reset email' : 'Sign in'}</button>
      </form>
      <p class="small">${create ? 'Already have an account? <a href="#" data-m="signin">Sign in</a>' : reset ? '<a href="#" data-m="signin">Back to sign in</a>' : 'New here? <a href="#" data-m="create">Create an account</a> · <a href="#" data-m="reset">Forgot password?</a>'}</p>
      <p class="acct-msg small" role="status"></p>
      <p class="muted small acct-privacy">We store your name, email and scenario results only — never patient information — using Google Firebase (servers in London). Data is used only to show you your progress and is never shared. You can delete your account and data at any time from this window.</p>
    </div>`;
  }

  function open() {
    if (!S.ui) return;
    S.ui.openModal(P.user ? 'Your account' : mode === 'create' ? 'Create an account' : mode === 'reset' ? 'Reset password' : 'Sign in', html());
    wire();
  }
  const isOpen = () => { const t = document.getElementById('modalTitle'), m = document.getElementById('modal'); return m && !m.hidden && /account|Sign in|Reset password/.test(t.textContent); };
  function msg(t, bad) { const m = document.querySelector('#modalBody .acct-msg'); if (m) { m.textContent = t; m.classList.toggle('bad', !!bad); } }
  function busy(on) { document.querySelectorAll('#modalBody button').forEach((b) => (b.disabled = on)); }

  function wire() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-m]').forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); mode = a.dataset.m; open(); }));
    const g = body.querySelector('[data-a="google"]');
    if (g) g.onclick = async () => { busy(true); msg(''); try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { msg(say(e), true); busy(false); } };
    const f = body.querySelector('[data-form]');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); busy(true); msg('');
      const email = f.email.value.trim(), pw = f.pw ? f.pw.value : '';
      try {
        if (mode === 'reset') { await sendPasswordResetEmail(auth, email); msg('If an account exists for that email, a reset link is on its way.'); busy(false); return; }
        if (mode === 'create') {
          const cr = await createUserWithEmailAndPassword(auth, email, pw);
          const name = f.name.value.trim();
          if (name) { await updateProfile(cr.user, { displayName: name }); setUser(cr.user); }
        } else await signInWithEmailAndPassword(auth, email, pw);
      } catch (e) { msg(say(e), true); busy(false); }
    };
    const act = (a) => body.querySelector(`[data-a="${a}"]`);
    if (act('progress')) act('progress').onclick = () => P.open();
    if (act('signout')) act('signout').onclick = async () => { await signOut(auth); toast('Signed out'); };
    if (act('delete')) act('delete').onclick = async () => {
      if (!confirmDelete) { confirmDelete = true; act('delete').textContent = 'Click again to confirm deletion'; return; }
      busy(true); msg('Deleting…');
      try {
        const uid = auth.currentUser.uid;
        await P.remote.removeAll();
        await deleteUser(auth.currentUser);
        P.forgetLocal(uid); confirmDelete = false;
        S.ui.closeModal(); toast('Your account and progress have been deleted.');
      } catch (e) { msg(say(e), true); busy(false); }
    };
  }

  function setUser(u) { P.user = u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null; }

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      setUser(u);
      const added = await P.signedIn(P.user);
      if (added) toast(`${added} earlier result${added === 1 ? '' : 's'} from this device added to your account.`);
      if (isOpen()) { if (/Sign in|Create|Reset/.test(document.getElementById('modalTitle').textContent)) { S.ui.closeModal(); toast('Signed in as ' + (P.user.name || P.user.email)); } else open(); }
    } else {
      P.signedOut(); mode = 'signin';
      if (isOpen()) open();
    }
  });

  S.Account = { open };
  P.refreshUI();
}
