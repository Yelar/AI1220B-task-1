"use client";

import type { AccessibleDocument, DocumentRecord, DocumentShare, UserRole } from "./types";

const accessStorageKey = "swp1-document-access";

type DocumentAccessRecord = {
  documentId: number;
  ownerEmail: string;
  shares: DocumentShare[];
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readRecords() {
  if (!isBrowser()) {
    return [] as DocumentAccessRecord[];
  }

  const raw = window.localStorage.getItem(accessStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as DocumentAccessRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: DocumentAccessRecord[]) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(accessStorageKey, JSON.stringify(records));
}

function upsertRecord(nextRecord: DocumentAccessRecord) {
  const records = readRecords();
  const next = records.filter((record) => record.documentId !== nextRecord.documentId);
  next.push(nextRecord);
  writeRecords(next);
}

function getRecord(documentId: number, fallbackOwnerEmail: string) {
  const normalizedFallback = normalizeEmail(fallbackOwnerEmail);
  const records = readRecords();
  const existing = records.find((record) => record.documentId === documentId);

  if (existing) {
    return existing;
  }

  const created: DocumentAccessRecord = {
    documentId,
    ownerEmail: normalizedFallback,
    shares: [],
  };
  upsertRecord(created);
  return created;
}

export function ensureDocumentAccess(documentId: number, ownerEmail: string) {
  return getRecord(documentId, ownerEmail);
}

export function getDocumentRole(documentId: number, currentUserEmail: string, fallbackOwnerEmail: string): UserRole | null {
  const normalizedCurrent = normalizeEmail(currentUserEmail);
  const record = getRecord(documentId, fallbackOwnerEmail);

  if (record.ownerEmail === normalizedCurrent) {
    return "owner";
  }

  const share = record.shares.find((item) => normalizeEmail(item.email) === normalizedCurrent);
  return share?.role ?? null;
}

export function listDocumentShares(documentId: number, fallbackOwnerEmail: string) {
  return [...getRecord(documentId, fallbackOwnerEmail).shares];
}

export function setDocumentShare(
  documentId: number,
  ownerEmail: string,
  email: string,
  role: Exclude<UserRole, "owner">,
) {
  const normalizedOwner = normalizeEmail(ownerEmail);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || normalizedEmail === normalizedOwner) {
    return getRecord(documentId, ownerEmail).shares;
  }

  const record = getRecord(documentId, ownerEmail);
  const shares = record.shares.filter((item) => normalizeEmail(item.email) !== normalizedEmail);
  shares.push({ email: normalizedEmail, role });
  upsertRecord({ ...record, ownerEmail: normalizedOwner, shares });
  return shares;
}

export function removeDocumentShare(documentId: number, ownerEmail: string, email: string) {
  const record = getRecord(documentId, ownerEmail);
  const normalizedEmail = normalizeEmail(email);
  const shares = record.shares.filter((item) => normalizeEmail(item.email) !== normalizedEmail);
  upsertRecord({ ...record, shares });
  return shares;
}

export function getAccessibleDocuments(documents: DocumentRecord[], currentUserEmail: string): AccessibleDocument[] {
  return documents
    .map((document) => {
      const role = getDocumentRole(document.id, currentUserEmail, currentUserEmail);
      if (!role) {
        return null;
      }
      return { document, role } satisfies AccessibleDocument;
    })
    .filter((item): item is AccessibleDocument => item !== null);
}

