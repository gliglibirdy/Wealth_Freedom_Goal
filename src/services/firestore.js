import {
  collection, doc, getDocs, addDoc, updateDoc,
  deleteDoc, setDoc, getDoc, query, orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'

const colRef = (userId, name) => collection(db, 'users', userId, name)
const settingDoc = (userId, name) => doc(db, 'users', userId, 'settings', name)

// ── Settings ────────────────────────────────────────────────
export async function getSettings(userId) {
  const snap = await getDoc(settingDoc(userId, 'profile'))
  return snap.exists() ? snap.data() : { monthlyExpense: 0 }
}

export async function updateSettings(userId, data) {
  await setDoc(settingDoc(userId, 'profile'), data, { merge: true })
}

export async function getExchangeRates(userId) {
  const snap = await getDoc(settingDoc(userId, 'exchangeRates'))
  return snap.exists() ? snap.data() : { USD_NTD: 32, JPY_NTD: 0.21 }
}

export async function updateExchangeRates(userId, data) {
  await setDoc(settingDoc(userId, 'exchangeRates'), data, { merge: true })
}

// ── Accounts ─────────────────────────────────────────────────
export async function getAccounts(userId) {
  const snap = await getDocs(query(colRef(userId, 'accounts'), orderBy('order')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addAccount(userId, data) {
  return addDoc(colRef(userId, 'accounts'), { ...data, order: Date.now() })
}

export async function updateAccount(userId, id, data) {
  await updateDoc(doc(colRef(userId, 'accounts'), id), data)
}

export async function deleteAccount(userId, id) {
  await deleteDoc(doc(colRef(userId, 'accounts'), id))
}

// ── Holdings ─────────────────────────────────────────────────
export async function getHoldings(userId) {
  const snap = await getDocs(query(colRef(userId, 'holdings'), orderBy('order')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addHolding(userId, data) {
  return addDoc(colRef(userId, 'holdings'), { ...data, order: Date.now() })
}

export async function updateHolding(userId, id, data) {
  await updateDoc(doc(colRef(userId, 'holdings'), id), data)
}

export async function deleteHolding(userId, id) {
  await deleteDoc(doc(colRef(userId, 'holdings'), id))
}

// ── Records ──────────────────────────────────────────────────
export async function getRecords(userId) {
  const snap = await getDocs(query(colRef(userId, 'records'), orderBy('month', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function saveRecord(userId, monthId, data) {
  await setDoc(doc(colRef(userId, 'records'), monthId), data, { merge: true })
}

export async function deleteRecord(userId, id) {
  await deleteDoc(doc(colRef(userId, 'records'), id))
}

// ── Goals ────────────────────────────────────────────────────
export async function getGoals(userId) {
  const snap = await getDocs(colRef(userId, 'goals'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addGoal(userId, data) {
  return addDoc(colRef(userId, 'goals'), data)
}

export async function updateGoal(userId, id, data) {
  await updateDoc(doc(colRef(userId, 'goals'), id), data)
}

export async function deleteGoal(userId, id) {
  await deleteDoc(doc(colRef(userId, 'goals'), id))
}
