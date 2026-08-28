import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, Check, X, RotateCcw, Calendar, StickyNote, Smartphone } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// === Firebase 設定 ===
const firebaseConfig = {
  apiKey: "AIzaSyDb3elcypnqoKSZ7u9q8GR8PDgBXS0MzaA",
  authDomain: "momotodo.firebaseapp.com",
  projectId: "momotodo",
  storageBucket: "momotodo.firebasestorage.app",
  messagingSenderId: "929923029705",
  appId: "1:929923029705:web:c4bad5cf64b5d3cd5b0b18"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const SHARED_DOC = doc(db, 'data', 'shared'); // 全員で共有するドキュメント

// Firestore取得関数
const fbGetShared = async () => {
  try {
    const snap = await getDoc(SHARED_DOC);
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.error('Firestore取得失敗:', e);
    return null;
  }
};

// Firestore保存関数
const fbSetShared = async (data) => {
  try {
    await setDoc(SHARED_DOC, data, { merge: true });
  } catch (e) {
    console.error('Firestore保存失敗:', e);
  }
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// パスワード認証
const STORAGE_KEY_DEVICES = 'authorizedDevices';
const LOCAL_KEY_DEVICE_ID = 'tickcheck:deviceId';
const LOCAL_KEY_AUTH_AT = 'tickcheck:authAt';
const APP_PASSWORD = 'moptodo440';
const MAX_DEVICES = 3;
const AUTH_VALID_DAYS = 365; // 1年間有効

const TABS = [
  { id: 'daily', label: '日常', desc: 'ルーティン' },
  { id: 'adhoc', label: 'スポット', desc: 'やること' },
  { id: 'work', label: '仕事', desc: 'タスク' },
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dueStatus = (due) => {
  if (!due) return null;
  const today = new Date(todayStr());
  const d = new Date(due);
  const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 2) return 'soon';
  return 'normal';
};

export default function App() {
  const [activeTab, setActiveTab] = useState('daily');
  const [todos, setTodos] = useState({ daily: [], adhoc: [], work: [] });
  const [hydrated, setHydrated] = useState(false);

  const [newText, setNewText] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [newDue, setNewDue] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editDue, setEditDue] = useState('');

  const [poppingId, setPoppingId] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // パスワード認証
  const [isAuthed, setIsAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [authStep, setAuthStep] = useState('password'); // 'password' | 'deviceName' | 'deviceFull'
  const [authorizedDevices, setAuthorizedDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [showDeviceManage, setShowDeviceManage] = useState(false);

  // 自分が起こした更新を一時的に無視するためのフラグ
  const skipNextSnapshot = useRef(false);

  // 起動時の認証チェック
  useEffect(() => {
    (async () => {
      try {
        const deviceId = localStorage.getItem(LOCAL_KEY_DEVICE_ID);
        const authAt = localStorage.getItem(LOCAL_KEY_AUTH_AT);
        setCurrentDeviceId(deviceId || '');

        if (!deviceId || !authAt) {
          setAuthChecking(false);
          return;
        }

        const authTime = parseInt(authAt, 10);
        const validUntil = authTime + AUTH_VALID_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() > validUntil) {
          localStorage.removeItem(LOCAL_KEY_AUTH_AT);
          setAuthChecking(false);
          return;
        }

        const data = await fbGetShared();
        const devices = (data && Array.isArray(data[STORAGE_KEY_DEVICES])) ? data[STORAGE_KEY_DEVICES] : [];
        setAuthorizedDevices(devices);
        const found = devices.find((d) => d.id === deviceId);
        if (found) {
          setIsAuthed(true);
        }
      } catch (e) {
        console.error('認証チェック失敗:', e);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  // パスワード送信
  const handlePasswordSubmit = async () => {
    if (passwordInput !== APP_PASSWORD) {
      setPasswordError('パスワードが違います');
      return;
    }
    setPasswordError('');
    try {
      const data = await fbGetShared();
      const devices = (data && Array.isArray(data[STORAGE_KEY_DEVICES])) ? data[STORAGE_KEY_DEVICES] : [];
      setAuthorizedDevices(devices);
      if (devices.length >= MAX_DEVICES) {
        setAuthStep('deviceFull');
      } else {
        setAuthStep('deviceName');
      }
    } catch (e) {
      console.error('デバイス確認失敗:', e);
      setPasswordError('接続エラー、少し待って再試行してください');
    }
  };

  // デバイス登録
  const handleDeviceRegister = async () => {
    const name = deviceNameInput.trim();
    if (!name) {
      setPasswordError('デバイス名を入れてください');
      return;
    }
    setPasswordError('');
    try {
      const newDeviceId = uid() + uid();
      const data = await fbGetShared();
      const devices = (data && Array.isArray(data[STORAGE_KEY_DEVICES])) ? data[STORAGE_KEY_DEVICES] : [];
      if (devices.length >= MAX_DEVICES) {
        setAuthStep('deviceFull');
        setAuthorizedDevices(devices);
        return;
      }
      const newDevices = [...devices, { id: newDeviceId, name, addedAt: new Date().toISOString() }];
      await fbSetShared({ [STORAGE_KEY_DEVICES]: newDevices });
      localStorage.setItem(LOCAL_KEY_DEVICE_ID, newDeviceId);
      localStorage.setItem(LOCAL_KEY_AUTH_AT, Date.now().toString());
      setAuthorizedDevices(newDevices);
      setCurrentDeviceId(newDeviceId);
      setIsAuthed(true);
      setPasswordInput('');
      setDeviceNameInput('');
      setAuthStep('password');
    } catch (e) {
      console.error('デバイス登録失敗:', e);
      setPasswordError('登録エラー、少し待って再試行してください');
    }
  };

  // デバイス削除(認証画面から)
  const handleRemoveDeviceFromAuth = async (idToRemove) => {
    try {
      const data = await fbGetShared();
      const devices = (data && Array.isArray(data[STORAGE_KEY_DEVICES])) ? data[STORAGE_KEY_DEVICES] : [];
      const newDevices = devices.filter((d) => d.id !== idToRemove);
      await fbSetShared({ [STORAGE_KEY_DEVICES]: newDevices });
      setAuthorizedDevices(newDevices);
      if (newDevices.length < MAX_DEVICES) {
        setAuthStep('deviceName');
      }
    } catch (e) {
      console.error('デバイス削除失敗:', e);
      setPasswordError('削除エラー、少し待って再試行してください');
    }
  };

  // デバイス削除(タイトル横の管理画面から)
  const handleRemoveDevice = async (idToRemove) => {
    try {
      const data = await fbGetShared();
      const devices = (data && Array.isArray(data[STORAGE_KEY_DEVICES])) ? data[STORAGE_KEY_DEVICES] : [];
      const newDevices = devices.filter((d) => d.id !== idToRemove);
      await fbSetShared({ [STORAGE_KEY_DEVICES]: newDevices });
      setAuthorizedDevices(newDevices);
      if (idToRemove === currentDeviceId) {
        localStorage.removeItem(LOCAL_KEY_DEVICE_ID);
        localStorage.removeItem(LOCAL_KEY_AUTH_AT);
        setIsAuthed(false);
        setShowDeviceManage(false);
      }
    } catch (e) {
      console.error('デバイス削除失敗:', e);
    }
  };

  // === Firestoreリアルタイム購読(認証後のみ) ===
  useEffect(() => {
    if (!isAuthed) return;
    const unsubscribe = onSnapshot(SHARED_DOC, (snap) => {
      if (skipNextSnapshot.current) {
        skipNextSnapshot.current = false;
        return;
      }
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.todos && typeof data.todos === 'object') {
          setTodos({
            daily: Array.isArray(data.todos.daily) ? data.todos.daily : [],
            adhoc: Array.isArray(data.todos.adhoc) ? data.todos.adhoc : [],
            work: Array.isArray(data.todos.work) ? data.todos.work : [],
          });
        }
      }
      setHydrated(true);
    }, (err) => {
      console.error('Firestore購読エラー:', err);
      setHydrated(true);
    });
    return () => unsubscribe();
  }, [isAuthed]);

  // todos変更時にFirestoreに保存
  const saveTodos = (next) => {
    setTodos(next);
    skipNextSnapshot.current = true;
    fbSetShared({ todos: next });
  };

  const items = todos[activeTab];
  const showMeta = activeTab !== 'daily';

  const resetNewForm = () => {
    setNewText('');
    setNewMemo('');
    setNewDue('');
    setShowAddModal(false);
  };

  const addTodo = () => {
    const text = newText.trim();
    if (!text) return;
    const newItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text,
      done: false,
      createdAt: todayStr(),
      memo: showMeta ? newMemo.trim() : '',
      due: showMeta ? newDue : '',
    };
    saveTodos({ ...todos, [activeTab]: [...items, newItem] });
    resetNewForm();
  };

  const toggleDone = (id) => {
    const target = items.find((t) => t.id === id);
    if (target && !target.done) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(15); } catch (e) { /* ignore */ }
      }
      setPoppingId(id);
    }
    saveTodos({
      ...todos,
      [activeTab]: items.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  };

  // poppingアニメ後にリセット
  useEffect(() => {
    if (poppingId == null) return;
    const t = setTimeout(() => setPoppingId(null), 250);
    return () => clearTimeout(t);
  }, [poppingId]);

  const requestDelete = (id) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = () => {
    if (deleteTargetId == null) return;
    saveTodos({
      ...todos,
      [activeTab]: items.filter((t) => t.id !== deleteTargetId),
    });
    if (editingId === deleteTargetId) setEditingId(null);
    setDeleteTargetId(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditMemo(item.memo || '');
    setEditDue(item.due || '');
  };

  const saveEdit = () => {
    if (!editText.trim()) return;
    saveTodos({
      ...todos,
      [activeTab]: items.map((t) =>
        t.id === editingId
          ? { ...t, text: editText.trim(), memo: editMemo, due: editDue }
          : t
      ),
    });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const move = (idx, dir) => {
    const list = todos[activeTab];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    const next = [...list];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    saveTodos({ ...todos, [activeTab]: next });
  };

  const resetAllChecks = () => {
    saveTodos({
      ...todos,
      daily: todos.daily.map((t) => ({ ...t, done: false })),
    });
    setShowResetConfirm(false);
  };

  const dueColor = (status) => {
    switch (status) {
      case 'overdue': return '#c8553d';
      case 'today':   return '#d68a00';
      case 'soon':    return '#a07f00';
      default:        return '#999';
    }
  };

  // 認証チェック中
  if (authChecking) {
    return (
      <div style={styles.app}>
        <div style={{ ...styles.container, textAlign: 'center', paddingTop: 80 }}>
          <p style={styles.subtitle}>読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未認証:パスワード画面
  if (!isAuthed) {
    return (
      <div style={styles.app}>
        <div style={styles.authWrap}>
          <div style={styles.authCard}>
            <h1 style={styles.title}>Tick Check</h1>

            {authStep === 'password' && (
              <>
                <label style={styles.authLabel}>パスワード</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                  autoFocus
                  style={styles.authInput}
                />
                {passwordError && <p style={styles.authError}>{passwordError}</p>}
                <button onClick={handlePasswordSubmit} style={styles.authBtn}>
                  入る
                </button>
              </>
            )}

            {authStep === 'deviceName' && (
              <>
                <p style={styles.authLabel}>このデバイスの名前を決めてください</p>
                <p style={styles.authHint}>例:「ぽっつのiPhone」「大島のMac」</p>
                <input
                  type="text"
                  value={deviceNameInput}
                  onChange={(e) => { setDeviceNameInput(e.target.value); setPasswordError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDeviceRegister(); }}
                  autoFocus
                  placeholder="デバイス名"
                  style={styles.authInput}
                />
                {passwordError && <p style={styles.authError}>{passwordError}</p>}
                <button onClick={handleDeviceRegister} style={styles.authBtn}>
                  登録して入る
                </button>
              </>
            )}

            {authStep === 'deviceFull' && (
              <>
                <p style={{ ...styles.authError, marginBottom: 6 }}>
                  登録済みデバイスが{MAX_DEVICES}台に達しています
                </p>
                <p style={styles.authHint}>入るには、既存のデバイスを1台解除してください</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
                  {authorizedDevices.map((d) => (
                    <div key={d.id} style={styles.deviceRow}>
                      <span style={{ fontSize: 13 }}>{d.name}</span>
                      <button
                        onClick={() => handleRemoveDeviceFromAuth(d.id)}
                        style={styles.deviceRemoveBtn}
                      >
                        解除
                      </button>
                    </div>
                  ))}
                </div>
                {passwordError && <p style={styles.authError}>{passwordError}</p>}
                <button
                  onClick={() => { setAuthStep('password'); setPasswordInput(''); }}
                  style={styles.cancelBtn}
                >
                  戻る
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.titleRow}>
            <h1 style={styles.title}>Tick Check</h1>
            <button
              onClick={() => setShowDeviceManage(true)}
              style={styles.deviceIconBtn}
              aria-label="端末管理"
              title="端末管理"
            >
              <Smartphone size={13} />
            </button>
          </div>
          {!hydrated && <p style={styles.subtitle}>読み込み中...</p>}
        </header>

        <div style={styles.tabs}>
          {TABS.map((tab) => {
            const tabItems = todos[tab.id];
            const tabDone = tabItems.filter((t) => t.done).length;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setEditingId(null);
                  resetNewForm();
                }}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab.id ? styles.tabActive : {}),
                }}
              >
                <div style={styles.tabLabel}>{tab.label}</div>
                <div style={styles.tabDesc}>
                  {tabItems.length > 0 ? `${tabDone}/${tabItems.length}` : tab.desc}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={styles.openModalBtn}
        >
          <Plus size={18} />
          <span>追加</span>
        </button>

        {activeTab === 'daily' && items.length > 0 && (
          <button onClick={() => setShowResetConfirm(true)} style={styles.resetBtn}>
            <RotateCcw size={14} />
            <span>全てのチェックを外す</span>
          </button>
        )}

        <ul style={styles.list}>
          {items.length === 0 && (
            <li style={styles.empty}>まだ項目がありません</li>
          )}
          {items.map((item, idx) => {
            const isEditing = editingId === item.id;
            const status = dueStatus(item.due);

            if (isEditing) {
              return (
                <li key={item.id} style={styles.itemEditing}>
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === 'Escape') {
                        cancelEdit();
                      }
                    }}
                    style={styles.editInput}
                    autoFocus
                  />
                  {showMeta && (
                    <>
                      <div style={styles.fieldRow}>
                        <label style={styles.fieldLabel}>
                          <Calendar size={12} /> 締切
                        </label>
                        <input
                          type="date"
                          value={editDue}
                          onChange={(e) => setEditDue(e.target.value)}
                          style={styles.dateInput}
                        />
                        {editDue && (
                          <button
                            onClick={() => setEditDue('')}
                            style={styles.clearBtn}
                          >
                            クリア
                          </button>
                        )}
                      </div>
                      <textarea
                        value={editMemo}
                        onChange={(e) => setEditMemo(e.target.value)}
                        placeholder="メモ..."
                        style={styles.memoInput}
                        rows={2}
                      />
                    </>
                  )}
                  <div style={styles.editActions}>
                    <button onClick={saveEdit} style={styles.saveBtn}>
                      <Check size={16} /> 保存
                    </button>
                    <button onClick={cancelEdit} style={styles.cancelBtn}>
                      <X size={16} /> キャンセル
                    </button>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.id} style={styles.item}>
                <div style={styles.itemMain}>
                  <button
                    onClick={() => toggleDone(item.id)}
                    style={{
                      ...styles.checkbox,
                      ...(item.done ? styles.checkboxDone : {}),
                      transform: poppingId === item.id ? 'scale(1.3)' : 'scale(1)',
                      transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s, border-color 0.15s',
                    }}
                    aria-label="完了切り替え"
                  >
                    {item.done && <Check size={14} strokeWidth={3} />}
                  </button>
                  <div style={styles.itemBody}>
                    <div
                      style={{
                        ...styles.itemText,
                        ...(item.done ? styles.itemTextDone : {}),
                      }}
                    >
                      {item.text}
                    </div>
                    {showMeta && (
                      <div style={styles.meta}>
                        <span style={styles.metaCreated}>登録 {item.createdAt}</span>
                        {item.due && (
                          <span style={{ ...styles.metaDue, color: dueColor(status) }}>
                            <Calendar size={10} /> {item.due}
                            {status === 'overdue' && ' (期限切れ)'}
                            {status === 'today' && ' (今日)'}
                          </span>
                        )}
                        {item.memo && (
                          <span style={styles.metaMemo}>
                            <StickyNote size={10} /> {item.memo}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={styles.itemActions}>
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      style={styles.iconBtn}
                      aria-label="上へ"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      style={styles.iconBtn}
                      aria-label="下へ"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      style={styles.iconBtn}
                      aria-label="編集"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => requestDelete(item.id)}
                      style={{ ...styles.iconBtn, ...styles.deleteBtn }}
                      aria-label="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 追加モーダル */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={resetNewForm}>
          <div
            style={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>
                {TABS.find(t => t.id === activeTab)?.label}に追加
              </h2>
              <button
                onClick={resetNewForm}
                style={styles.modalClose}
                aria-label="閉じる"
              >
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTodo();
                  }
                }}
                placeholder="新しいやること..."
                style={styles.input}
                autoFocus
              />

              {showMeta && (
                <div style={styles.detailFields}>
                  <div style={styles.fieldRow}>
                    <label style={styles.fieldLabel}>
                      <Calendar size={12} /> 締切
                    </label>
                    <input
                      type="date"
                      value={newDue}
                      onChange={(e) => setNewDue(e.target.value)}
                      style={styles.dateInput}
                    />
                    {newDue && (
                      <button
                        onClick={() => setNewDue('')}
                        style={styles.clearBtn}
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <textarea
                    value={newMemo}
                    onChange={(e) => setNewMemo(e.target.value)}
                    placeholder="メモ..."
                    style={styles.memoInput}
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button onClick={resetNewForm} style={styles.cancelBtn}>
                キャンセル
              </button>
              <button
                onClick={addTodo}
                style={{
                  ...styles.saveBtn,
                  opacity: newText.trim() ? 1 : 0.4,
                }}
                disabled={!newText.trim()}
              >
                <Check size={16} /> 追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* リセット確認モーダル */}
      {showResetConfirm && (
        <div style={styles.modalOverlay} onClick={() => setShowResetConfirm(false)}>
          <div
            style={{ ...styles.modal, maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalBody}>
              <div style={styles.confirmIcon}>
                <RotateCcw size={28} />
              </div>
              <h2 style={styles.confirmTitle}>チェックを全て外す</h2>
              <p style={styles.confirmText}>
                日常タブの全てのチェックを外します。よろしいですか？
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setShowResetConfirm(false)} style={styles.cancelBtn}>
                キャンセル
              </button>
              <button onClick={resetAllChecks} style={styles.saveBtn}>
                <Check size={16} /> 外す
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 端末管理モーダル */}
      {showDeviceManage && (
        <div style={styles.modalOverlay} onClick={() => setShowDeviceManage(false)}>
          <div style={{ ...styles.modal, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>接続中の端末({authorizedDevices.length}/{MAX_DEVICES})</h2>
              <button onClick={() => setShowDeviceManage(false)} style={styles.modalClose} aria-label="閉じる">
                <X size={20} />
              </button>
            </div>
            <div style={styles.modalBody}>
              {authorizedDevices.length === 0 && (
                <p style={{ fontSize: 12, color: '#aaa' }}>登録された端末がありません</p>
              )}
              {authorizedDevices.map((d) => {
                const isCurrent = d.id === currentDeviceId;
                return (
                  <div key={d.id} style={styles.deviceRow}>
                    <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d.name}
                      {isCurrent && <span style={styles.deviceCurrentBadge}>この端末</span>}
                    </span>
                    <button
                      onClick={() => {
                        const msg = isCurrent
                          ? 'この端末を解除するとログアウトされます。よろしいですか？'
                          : `「${d.name}」を解除しますか？`;
                        if (window.confirm(msg)) handleRemoveDevice(d.id);
                      }}
                      style={styles.deviceRemoveBtn}
                    >
                      解除
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteTargetId != null && (
        <div style={styles.modalOverlay} onClick={() => setDeleteTargetId(null)}>
          <div
            style={{ ...styles.modal, maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalBody}>
              <div style={{ ...styles.confirmIcon, color: '#c66' }}>
                <Trash2 size={26} />
              </div>
              <h2 style={styles.confirmTitle}>削除しますか？</h2>
              <p style={styles.confirmText}>
                {items.find(t => t.id === deleteTargetId)?.text || ''}
              </p>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => setDeleteTargetId(null)} style={styles.cancelBtn}>
                キャンセル
              </button>
              <button onClick={confirmDelete} style={{ ...styles.saveBtn, background: '#c66' }}>
                <Trash2 size={14} /> 削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: '#f6f6f4',
    padding: '20px 12px',
    color: '#222',
  },
  container: { maxWidth: 560, margin: '0 auto' },
  header: { marginBottom: 20, textAlign: 'center' },
  titleRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  title: { fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: '#aaa', margin: '4px 0 0' },
  deviceIconBtn: {
    width: 22, height: 22, background: 'transparent', border: '1px solid #ddd',
    borderRadius: '50%', cursor: 'pointer', color: '#bbb',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    flexShrink: 0,
  },
  authWrap: {
    minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  authCard: {
    width: '100%', maxWidth: 340, background: '#fff', borderRadius: 14,
    padding: '24px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    border: '1px solid #eee', textAlign: 'center',
  },
  authLabel: { fontSize: 13, color: '#555', margin: '14px 0 6px', textAlign: 'left' },
  authHint: { fontSize: 11, color: '#aaa', margin: '0 0 8px', textAlign: 'left' },
  authInput: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8,
    fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  },
  authError: { fontSize: 12, color: '#c66', margin: '6px 0 0', textAlign: 'left' },
  authBtn: {
    width: '100%', padding: '11px', marginTop: 14, background: '#222', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500,
  },
  deviceRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', background: '#f6f6f4', borderRadius: 8, border: '1px solid #eee',
  },
  deviceRemoveBtn: {
    padding: '4px 10px', background: '#c66', color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontSize: 11, flexShrink: 0,
  },
  deviceCurrentBadge: {
    fontSize: 9, padding: '1px 5px', background: '#4a8c5e', color: '#fff', borderRadius: 4,
  },
  tabs: {
    display: 'flex', gap: 6, marginBottom: 16,
    background: '#ececea', padding: 4, borderRadius: 10,
  },
  tab: {
    flex: 1, padding: '8px 4px', background: 'transparent',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    transition: 'all 0.15s', color: '#666',
  },
  tabActive: {
    background: '#fff', color: '#222',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  tabLabel: { fontSize: 14, fontWeight: 600 },
  tabDesc: { fontSize: 10, marginTop: 2, opacity: 0.7 },
  openModalBtn: {
    width: '100%',
    padding: '12px',
    background: '#222',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 12,
  },
  input: {
    flex: 1, padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 15, background: '#fff', outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  },
  detailFields: {
    marginTop: 10, paddingTop: 10, borderTop: '1px dashed #eee',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 8 },
  fieldLabel: {
    fontSize: 12, color: '#666', display: 'flex',
    alignItems: 'center', gap: 4, minWidth: 50,
  },
  dateInput: {
    padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
  },
  clearBtn: {
    padding: '4px 8px', background: 'transparent', border: 'none',
    color: '#999', fontSize: 11, cursor: 'pointer',
  },
  memoInput: {
    padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  },
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 14,
    width: '100%', maxWidth: 480, maxHeight: '90vh',
    overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #f0f0ed',
  },
  modalTitle: { fontSize: 15, fontWeight: 600, margin: 0, color: '#222' },
  modalClose: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#888', padding: 4, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  modalFooter: {
    display: 'flex', gap: 8, padding: 12,
    borderTop: '1px solid #f0f0ed', justifyContent: 'flex-end',
  },
  confirmIcon: {
    display: 'flex', justifyContent: 'center',
    color: '#888', marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 16, fontWeight: 600, margin: 0,
    textAlign: 'center', color: '#222',
  },
  confirmText: {
    fontSize: 13, color: '#666', margin: 0,
    textAlign: 'center', lineHeight: 1.6,
  },
  resetBtn: {
    width: '100%', padding: '8px 12px', background: '#fff',
    border: '1px dashed #ccc', borderRadius: 8, color: '#666',
    fontSize: 12, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    marginBottom: 12,
  },
  list: {
    listStyle: 'none', padding: 0, margin: 0,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  empty: {
    textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13,
  },
  item: {
    background: '#fff', borderRadius: 8, border: '1px solid #eee',
    overflow: 'hidden',
  },
  itemMain: {
    display: 'flex', alignItems: 'flex-start',
    padding: '10px 12px', gap: 10,
  },
  itemBody: { flex: 1, minWidth: 0, paddingTop: 1 },
  itemText: { fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word' },
  itemTextDone: { textDecoration: 'line-through', color: '#aaa' },
  meta: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    gap: '4px 10px', fontSize: 11, color: '#999', marginTop: 4,
  },
  metaCreated: { color: '#aaa' },
  metaDue: {
    display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500,
  },
  metaMemo: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    color: '#888', wordBreak: 'break-word', maxWidth: '100%',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: '50%',
    border: '1.5px solid #ccc', background: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', flexShrink: 0, padding: 0, marginTop: 1,
  },
  checkboxDone: { background: '#4a8c5e', borderColor: '#4a8c5e' },
  itemActions: { display: 'flex', gap: 2, flexShrink: 0 },
  iconBtn: {
    width: 28, height: 28, background: 'transparent', border: 'none',
    borderRadius: 4, cursor: 'pointer', color: '#888',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  deleteBtn: { color: '#c66' },
  itemEditing: {
    background: '#fff', border: '1px solid #222', borderRadius: 8,
    padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
  },
  editInput: {
    padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6,
    fontSize: 15, outline: 'none', fontFamily: 'inherit',
  },
  editActions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  saveBtn: {
    padding: '6px 12px', background: '#222', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 4,
  },
  cancelBtn: {
    padding: '6px 12px', background: '#f0f0ed', color: '#666',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 4,
  },
};
