import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, Check, X, RotateCcw, Calendar, StickyNote } from 'lucide-react';
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

// Firestore保存関数
const fbSetShared = async (data) => {
  try {
    await setDoc(SHARED_DOC, data, { merge: true });
  } catch (e) {
    console.error('Firestore保存失敗:', e);
  }
};

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

  // 自分が起こした更新を一時的に無視するためのフラグ
  const skipNextSnapshot = useRef(false);

  // === Firestoreリアルタイム購読 ===
  useEffect(() => {
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
  }, []);

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

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>Tick Check</h1>
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
  title: { fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: '#aaa', margin: '4px 0 0' },
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
