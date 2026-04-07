import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, FileCheck, FolderOpen, LoaderCircle, Upload, X } from 'lucide-react';
import { YEARS } from '../constants';
import { getAssignmentKey } from '../access';
import { uploadFile } from '../supabase';
import {
  createOverwriteRequest,
  listOverwriteRequests,
  updateOverwriteRequestDecision,
  upsertDataFileRecord,
} from '../supabaseStore';
import { DataFileRecordSummary, DataRow, FormTemplate, ManagedUnit, OverwriteRequestRecord, Project, UserProfile } from '../types';
import { parseLegacyFromWorkbook, parseTemplateFromWorkbook } from '../utils/excelParser';
import { getPinnedYearPreference, getPreferredReportingYear, setPinnedYearPreference } from '../utils/reportingYear';
import { validateTemplateSheetSignature, validateWorkbookSheetNames } from '../utils/workbookUtils';

type FileMatchType = 'CODE' | 'NAME' | 'FUZZY' | 'MANUAL' | 'NONE';
type FileMatchStatus = 'AUTO_FILLED' | 'NEEDS_CONFIRMATION' | 'MANUAL' | 'UNMATCHED' | 'CONFLICT';
type VisibleFileFilter = 'ALL' | 'READY' | 'NEEDS_CONFIRMATION' | 'INVALID' | 'WITH_EXISTING_DATA';

type PendingFile = {
  id: string;
  file: File;
  relativePath: string;
  unitCode: string;
  unitQuery: string;
  suggestedUnitCode: string;
  suggestedUnitName: string;
  matchType: FileMatchType;
  matchStatus: FileMatchStatus;
  matchScore: number;
  matchReason: string;
};

type FileValidationState = {
  status: 'pending' | 'valid' | 'invalid';
  missingSheets: string[];
  matchedSheets: string[];
  reason?: string;
};

type UnitMatchResult = {
  unitCode: string;
  unitName: string;
  type: FileMatchType;
  score: number;
  reason: string;
};

type FailedFile = {
  unitName: string;
  fileName: string;
  missingSheets: string[];
  reason?: string;
  relativePath?: string;
};

type OperationProgress = {
  visible: boolean;
  title: string;
  description: string;
  percent: number;
  status: 'running' | 'done';
};

type ImportResultSummary = {
  visible: boolean;
  totalSelected: number;
  updatedCount: number;
  failedFiles: FailedFile[];
  partialWarnings: string[];
};

type IntakeUnitStatus = {
  code: string;
  name: string;
  rowCount: number;
  isSubmitted: boolean;
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function repairMojibake(value: string) {
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded.includes('ï¿½') ? value : decoded;
  } catch {
    return value;
  }
}

const INTAKE_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ['TiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'Tiáº¿p nháº­n dá»¯ liá»‡u'],
  ['ChÃ¡Â»Ân dÃ¡Â»Â± ÃƒÂ¡n, nÃ„Æ’m vÃƒÂ  biÃ¡Â»Æ’u mÃ¡ÂºÂ«u phÃƒÂ¹ hÃ¡Â»Â£p Ã„â€˜Ã¡Â»Æ’ nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u Excel theo Ã„â€˜ÃƒÂºng cÃ¡ÂºÂ¥u trÃƒÂºc Ã„â€˜ÃƒÂ£ phÃƒÂ¡t hÃƒÂ nh.', 'Chá»n dá»± Ã¡n, nÄƒm vÃ  biá»ƒu máº«u phÃ¹ há»£p Ä‘á»ƒ nháº­p dá»¯ liá»‡u Excel theo Ä‘Ãºng cáº¥u trÃºc Ä‘Ã£ phÃ¡t hÃ nh.'],
  ['DÃ¡Â»Â± ÃƒÂ¡n', 'Dá»± Ã¡n'],
  ['ChÃ¡Â»Ân Ã„â€˜ÃƒÂºng dÃ¡Â»Â± ÃƒÂ¡n Ã„â€˜Ã¡Â»Æ’ hÃ¡Â»â€¡ thÃ¡Â»â€˜ng lÃ¡Â»Âc Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ chÃ†Â°a tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n vÃƒÂ  cÃƒÂ¡c biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t tÃ†Â°Ã†Â¡ng Ã¡Â»Â©ng.', 'Chá»n Ä‘Ãºng dá»± Ã¡n Ä‘á»ƒ há»‡ thá»‘ng lá»c Ä‘Æ¡n vá»‹ chÆ°a tiáº¿p nháº­n vÃ  cÃ¡c biá»ƒu máº«u Ä‘Ã£ chá»‘t tÆ°Æ¡ng á»©ng.'],
  ['Ã„Âang hoÃ¡ÂºÂ¡t Ã„â€˜Ã¡Â»â„¢ng', 'Äang hoáº¡t Ä‘á»™ng'],
  ['Ã„ÂÃƒÂ£ hoÃƒÂ n thÃƒÂ nh', 'ÄÃ£ hoÃ n thÃ nh'],
  ['NÃ„Æ’m', 'NÄƒm'],
  ['Ghim nÃ„Æ’m nÃƒÂ y cho lÃ¡ÂºÂ§n nhÃ¡ÂºÂ­p sau', 'Ghim nÄƒm nÃ y cho láº§n nháº­p sau'],
  ['ChÃ†Â°a cÃƒÂ³ mÃƒÂ´ tÃ¡ÂºÂ£ dÃ¡Â»Â± ÃƒÂ¡n.', 'ChÆ°a cÃ³ mÃ´ táº£ dá»± Ã¡n.'],
  ['Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ chÃ†Â°a tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n', 'ÄÆ¡n vá»‹ chÆ°a tiáº¿p nháº­n'],
  ['Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹', 'Ä‘Æ¡n vá»‹'],
  ['Danh sÃƒÂ¡ch nÃƒÂ y dÃƒÂ¹ng cÃƒÂ¹ng logic vÃ¡Â»â€ºi NhÃ¡ÂºÂ­t kÃƒÂ½ vÃƒÂ  tÃ¡Â»Â± lÃ¡Â»Âc theo dÃ¡Â»Â± ÃƒÂ¡n, nÃ„Æ’m vÃƒÂ  phÃƒÂ¢n quyÃ¡Â»Ân theo dÃƒÂµi.', 'Danh sÃ¡ch nÃ y dÃ¹ng cÃ¹ng logic vá»›i Nháº­t kÃ½ vÃ  tá»± lá»c theo dá»± Ã¡n, nÄƒm vÃ  phÃ¢n quyá»n theo dÃµi.'],
  ['ChÃ†Â°a tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n', 'ChÆ°a tiáº¿p nháº­n'],
  ['Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ cÃ¡Â»Â§a bÃ¡ÂºÂ¡n Ã„â€˜ÃƒÂ£ cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u trong dÃ¡Â»Â± ÃƒÂ¡n/nÃ„Æ’m Ã„â€˜ang chÃ¡Â»Ân hoÃ¡ÂºÂ·c khÃƒÂ´ng cÃƒÂ²n mÃ¡Â»Â¥c chÃ†Â°a tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n.', 'ÄÆ¡n vá»‹ cá»§a báº¡n Ä‘Ã£ cÃ³ dá»¯ liá»‡u trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n hoáº·c khÃ´ng cÃ²n má»¥c chÆ°a tiáº¿p nháº­n.'],
  ['TÃƒÂ i khoÃ¡ÂºÂ£n nÃƒÂ y chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c phÃƒÂ¢n cÃƒÂ´ng Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ theo dÃƒÂµi cho luÃ¡Â»â€œng tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n.', 'TÃ i khoáº£n nÃ y chÆ°a Ä‘Æ°á»£c phÃ¢n cÃ´ng Ä‘Æ¡n vá»‹ theo dÃµi cho luá»“ng tiáº¿p nháº­n.'],
  ['KhÃƒÂ´ng cÃƒÂ²n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ nÃƒÂ o chÃ†Â°a tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n trong dÃ¡Â»Â± ÃƒÂ¡n/nÃ„Æ’m Ã„â€˜ang chÃ¡Â»Ân.', 'KhÃ´ng cÃ²n Ä‘Æ¡n vá»‹ nÃ o chÆ°a tiáº¿p nháº­n trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n.'],
  ['BiÃ¡Â»Æ’u mÃ¡ÂºÂ«u', 'Biá»ƒu máº«u'],
  ['HÃ¡Â»â€¡ thÃ¡Â»â€˜ng Ã„â€˜ang Ã„â€˜Ã¡Â»â€˜i chiÃ¡ÂºÂ¿u theo biÃ¡Â»Æ’u mÃ¡ÂºÂ«u bÃ¡ÂºÂ¡n chÃ¡Â»Ân. File chÃ¡Â»â€° Ã„â€˜Ã†Â°Ã¡Â»Â£c nhÃ¡ÂºÂ­n khi cÃƒÂ³ Ã„â€˜ÃƒÂºng sheet bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c cÃ¡Â»Â§a biÃ¡Â»Æ’u nÃƒÂ y.', 'Há»‡ thá»‘ng Ä‘ang Ä‘á»‘i chiáº¿u theo biá»ƒu máº«u báº¡n chá»n. File chá»‰ Ä‘Æ°á»£c nháº­n khi cÃ³ Ä‘Ãºng sheet báº¯t buá»™c cá»§a biá»ƒu nÃ y.'],
  ['Khi tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n, hÃ¡Â»â€¡ thÃ¡Â»â€˜ng sÃ¡ÂºÂ½ Ã„â€˜Ã¡Â»â€˜i chiÃ¡ÂºÂ¿u toÃƒÂ n bÃ¡Â»â„¢ biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n. File chÃ¡Â»â€° Ã„â€˜Ã†Â°Ã¡Â»Â£c nhÃ¡ÂºÂ­n khi Ã„â€˜Ã¡Â»Â§ 100% sheet bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c; cÃƒÂ¡c sheet thÃ¡Â»Â«a sÃ¡ÂºÂ½ tÃ¡Â»Â± bÃ¡Â»Â qua.', 'Khi tiáº¿p nháº­n, há»‡ thá»‘ng sáº½ Ä‘á»‘i chiáº¿u toÃ n bá»™ biá»ƒu máº«u Ä‘Ã£ chá»‘t cá»§a dá»± Ã¡n. File chá»‰ Ä‘Æ°á»£c nháº­n khi Ä‘á»§ 100% sheet báº¯t buá»™c; cÃ¡c sheet thá»«a sáº½ tá»± bá» qua.'],
  ['TÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t', 'Táº¥t cáº£ biá»ƒu máº«u Ä‘Ã£ chá»‘t'],
  ['DÃ¡Â»Â± ÃƒÂ¡n nÃƒÂ y chÃ†Â°a cÃƒÂ³ biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t Ã„â€˜Ã¡Â»Æ’ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n dÃ¡Â»Â¯ liÃ¡Â»â€¡u.', 'Dá»± Ã¡n nÃ y chÆ°a cÃ³ biá»ƒu máº«u Ä‘Ã£ chá»‘t Ä‘á»ƒ tiáº¿p nháº­n dá»¯ liá»‡u.'],
  ['QuÃ¡ÂºÂ£n trÃ¡Â»â€¹ dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m', 'Quáº£n trá»‹ dá»¯ liá»‡u theo nÄƒm'],
  ['-- ChÃ¡Â»Ân Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ --', '-- Chá»n Ä‘Æ¡n vá»‹ --'],
  ['XÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹', 'XÃ³a dá»¯ liá»‡u theo Ä‘Æ¡n vá»‹'],
  ['XÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m', 'XÃ³a dá»¯ liá»‡u theo nÄƒm'],
  ['XÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â± ÃƒÂ¡n hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i', 'XÃ³a toÃ n bá»™ dá»± Ã¡n hiá»‡n táº¡i'],
  ['PhÃƒÂª duyÃ¡Â»â€¡t ghi Ã„â€˜ÃƒÂ¨ dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'PhÃª duyá»‡t ghi Ä‘Ã¨ dá»¯ liá»‡u'],
  ['Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ Ã„â€˜ÃƒÂ£ cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u muÃ¡Â»â€˜n nÃ¡Â»â„¢p lÃ¡ÂºÂ¡i file sÃ¡ÂºÂ½ Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã†Â°a vÃƒÂ o danh sÃƒÂ¡ch chÃ¡Â»Â phÃƒÂª duyÃ¡Â»â€¡t. Admin duyÃ¡Â»â€¡t tÃ¡ÂºÂ¡i Ã„â€˜ÃƒÂ¢y Ã„â€˜Ã¡Â»Æ’ thay thÃ¡ÂºÂ¿ dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ…Â©.', 'ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u muá»‘n ná»™p láº¡i file sáº½ Ä‘Æ°á»£c Ä‘Æ°a vÃ o danh sÃ¡ch chá» phÃª duyá»‡t. Admin duyá»‡t táº¡i Ä‘Ã¢y Ä‘á»ƒ thay tháº¿ dá»¯ liá»‡u cÅ©.'],
  ['yÃƒÂªu cÃ¡ÂºÂ§u chÃ¡Â»Â duyÃ¡Â»â€¡t', 'yÃªu cáº§u chá» duyá»‡t'],
  ['NgÃ†Â°Ã¡Â»Âi gÃ¡Â»Â­i', 'NgÆ°á»i gá»­i'],
  ['ChÃ†Â°a xÃƒÂ¡c Ã„â€˜Ã¡Â»â€¹nh', 'ChÆ°a xÃ¡c Ä‘á»‹nh'],
  ['ChÃ¡Â»Â phÃƒÂª duyÃ¡Â»â€¡t', 'Chá» phÃª duyá»‡t'],
  ['Ghi chÃƒÂº phÃƒÂª duyÃ¡Â»â€¡t / tÃ¡Â»Â« chÃ¡Â»â€˜i', 'Ghi chÃº phÃª duyá»‡t / tá»« chá»‘i'],
  ['PhÃƒÂª duyÃ¡Â»â€¡t ghi Ã„â€˜ÃƒÂ¨', 'PhÃª duyá»‡t ghi Ä‘Ã¨'],
  ['TÃ¡Â»Â« chÃ¡Â»â€˜i', 'Tá»« chá»‘i'],
  ['KÃƒÂ©o thÃ¡ÂºÂ£ hoÃ¡ÂºÂ·c bÃ¡ÂºÂ¥m Ã„â€˜Ã¡Â»Æ’ chÃ¡Â»Ân file', 'KÃ©o tháº£ hoáº·c báº¥m Ä‘á»ƒ chá»n file'],
  ['TÃƒÂ i khoÃ¡ÂºÂ£n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ chÃ¡Â»â€° nÃ¡Â»â„¢p 1 file vÃƒÂ  hÃ¡Â»â€¡ thÃ¡Â»â€˜ng tÃ¡Â»Â± gÃ¡ÂºÂ¯n Ã„â€˜ÃƒÂºng Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p.', 'TÃ i khoáº£n Ä‘Æ¡n vá»‹ chá»‰ ná»™p 1 file vÃ  há»‡ thá»‘ng tá»± gáº¯n Ä‘Ãºng Ä‘Æ¡n vá»‹ Ä‘Äƒng nháº­p.'],
  ['PhÃƒÂ¹ hÃ¡Â»Â£p khi nhÃ¡ÂºÂ­n tÃ¡Â»Â«ng file lÃ¡ÂºÂ».', 'PhÃ¹ há»£p khi nháº­n tá»«ng file láº».'],
  ['ChÃ¡Â»Ân cÃ¡ÂºÂ£ thÃ†Â° mÃ¡Â»Â¥c dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'Chá»n cáº£ thÆ° má»¥c dá»¯ liá»‡u'],
  ['HÃ¡Â»â€¡ thÃ¡Â»â€˜ng sÃ¡ÂºÂ½ gÃ¡Â»Â£i ÃƒÂ½ Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ tÃ¡Â»Â« tÃƒÂªn file trong thÃ†Â° mÃ¡Â»Â¥c.', 'Há»‡ thá»‘ng sáº½ gá»£i Ã½ Ä‘Æ¡n vá»‹ tá»« tÃªn file trong thÆ° má»¥c.'],
  ['Danh sÃƒÂ¡ch file chÃ¡Â»Â tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n', 'Danh sÃ¡ch file chá» tiáº¿p nháº­n'],
  ['HÃ¡Â»â€¡ thÃ¡Â»â€˜ng tÃ¡Â»Â± gÃ¡ÂºÂ¯n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ theo tÃƒÂ i khoÃ¡ÂºÂ£n Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p vÃƒÂ  chÃ¡Â»â€° nhÃ¡ÂºÂ­n 1 file mÃ¡Â»â€”i lÃ¡ÂºÂ§n gÃ¡Â»Â­i.', 'Há»‡ thá»‘ng tá»± gáº¯n Ä‘Æ¡n vá»‹ theo tÃ i khoáº£n Ä‘Äƒng nháº­p vÃ  chá»‰ nháº­n 1 file má»—i láº§n gá»­i.'],
  ['HÃ¡Â»â€¡ thÃ¡Â»â€˜ng Ã„â€˜ÃƒÂ£ cÃ¡Â»â€˜ gÃ¡ÂºÂ¯ng tÃ¡Â»Â± nhÃ¡ÂºÂ­n diÃ¡Â»â€¡n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ tÃ¡Â»Â« tÃƒÂªn file. BÃ¡ÂºÂ¡n chÃ¡Â»â€° cÃ¡ÂºÂ§n rÃƒÂ  lÃ¡ÂºÂ¡i cÃƒÂ¡c file cÃ¡ÂºÂ§n xÃƒÂ¡c nhÃ¡ÂºÂ­n.', 'Há»‡ thá»‘ng Ä‘Ã£ cá»‘ gáº¯ng tá»± nháº­n diá»‡n Ä‘Æ¡n vá»‹ tá»« tÃªn file. Báº¡n chá»‰ cáº§n rÃ  láº¡i cÃ¡c file cáº§n xÃ¡c nháº­n.'],
  ['HiÃ¡Â»â€¡n tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ file', 'Hiá»‡n táº¥t cáº£ file'],
  ['ChÃ¡Â»â€° hiÃ¡Â»â€¡n file Ã„â€˜ÃƒÂ£ sÃ¡ÂºÂµn sÃƒÂ ng', 'Chá»‰ hiá»‡n file Ä‘Ã£ sáºµn sÃ ng'],
  ['ChÃ¡Â»â€° hiÃ¡Â»â€¡n file cÃ¡ÂºÂ§n xÃƒÂ¡c nhÃ¡ÂºÂ­n', 'Chá»‰ hiá»‡n file cáº§n xÃ¡c nháº­n'],
  ['Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ Ã„â€˜ÃƒÂ£ cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u'],
  ['ChÃ¡Â»â€° hiÃ¡Â»â€¡n file lÃ¡Â»â€”i sheet', 'Chá»‰ hiá»‡n file lá»—i sheet'],
  ['XÃƒÂ¡c nhÃ¡ÂºÂ­n tÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ gÃ¡Â»Â£i ÃƒÂ½ hÃ¡Â»Â£p lÃ¡Â»â€¡', 'XÃ¡c nháº­n táº¥t cáº£ gá»£i Ã½ há»£p lá»‡'],
  ['XuÃ¡ÂºÂ¥t danh sÃƒÂ¡ch file lÃ¡Â»â€”i', 'Xuáº¥t danh sÃ¡ch file lá»—i'],
  ['NÃ¡Â»â„¢p biÃ¡Â»Æ’u bÃƒÂ¡o cÃƒÂ¡o', 'Ná»™p biá»ƒu bÃ¡o cÃ¡o'],
  ['BÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u tÃ¡Â»â€¢ng hÃ¡Â»Â£p', 'Báº¯t Ä‘áº§u tá»•ng há»£p'],
  ['BÃ¡Â»â„¢ lÃ¡Â»Âc', 'Bá»™ lá»c'],
  ['Ã„â€˜ang dÃƒÂ¹ng cÃƒÂ¹ng Ã„â€˜iÃ¡Â»Âu kiÃ¡Â»â€¡n vÃ¡Â»â€ºi NhÃ¡ÂºÂ­t kÃƒÂ½', 'Ä‘ang dÃ¹ng cÃ¹ng Ä‘iá»u kiá»‡n vá»›i Nháº­t kÃ½'],
  ['BÃ¡Â»Â file', 'Bá» file'],
  ['Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ nÃ¡Â»â„¢p dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'ÄÆ¡n vá»‹ ná»™p dá»¯ liá»‡u'],
  ['HÃ¡Â»â€¡ thÃ¡Â»â€˜ng tÃ¡Â»Â± gÃ¡ÂºÂ¯n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ theo tÃƒÂ i khoÃ¡ÂºÂ£n Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p, khÃƒÂ´ng cÃ¡ÂºÂ§n chÃ¡Â»Ân lÃ¡ÂºÂ¡i.', 'Há»‡ thá»‘ng tá»± gáº¯n Ä‘Æ¡n vá»‹ theo tÃ i khoáº£n Ä‘Äƒng nháº­p, khÃ´ng cáº§n chá»n láº¡i.'],
  ['GÃƒÂµ tÃƒÂªn Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ Ã„â€˜Ã¡Â»Æ’ gÃ¡Â»Â£i ÃƒÂ½', 'GÃµ tÃªn Ä‘Æ¡n vá»‹ Ä‘á»ƒ gá»£i Ã½'],
  ['-- HoÃ¡ÂºÂ·c chÃ¡Â»Ân nhanh Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ --', '-- Hoáº·c chá»n nhanh Ä‘Æ¡n vá»‹ --'],
  ['GÃ¡Â»Â£i ÃƒÂ½', 'Gá»£i Ã½'],
  ['File hÃ¡Â»Â£p lÃ¡Â»â€¡. Ã„ÂÃƒÂ£ nhÃ¡ÂºÂ­n Ã„â€˜Ã¡Â»Â§ cÃƒÂ¡c sheet bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c', 'File há»£p lá»‡. ÄÃ£ nháº­n Ä‘á»§ cÃ¡c sheet báº¯t buá»™c'],
  ['ThiÃ¡ÂºÂ¿u sheet', 'Thiáº¿u sheet'],
  ['Ã„Âang kiÃ¡Â»Æ’m tra cÃ¡ÂºÂ¥u trÃƒÂºc file...', 'Äang kiá»ƒm tra cáº¥u trÃºc file...'],
  ['TiÃ¡ÂºÂ¿n Ã„â€˜Ã¡Â»â„¢ xÃ¡Â»Â­ lÃƒÂ½', 'Tiáº¿n Ä‘á»™ xá»­ lÃ½'],
  ['HoÃƒÂ n thÃƒÂ nh', 'HoÃ n thÃ nh'],
  ['Ã„ÂÃƒÂ£ hiÃ¡Â»Æ’u', 'ÄÃ£ hiá»ƒu'],
  ['KÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n', 'Káº¿t quáº£ tiáº¿p nháº­n'],
  ['TÃ¡Â»â€¢ng hÃ¡Â»Â£p file Ã„â€˜ÃƒÂ£ hoÃƒÂ n tÃ¡ÂºÂ¥t', 'Tá»•ng há»£p file Ä‘Ã£ hoÃ n táº¥t'],
  ['Ã„ÂÃƒÂ£ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t', 'ÄÃ£ cáº­p nháº­t'],
  ['KhÃƒÂ´ng cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t Ã„â€˜Ã†Â°Ã¡Â»Â£c', 'KhÃ´ng cáº­p nháº­t Ä‘Æ°á»£c'],
  ['Danh sÃƒÂ¡ch Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ khÃƒÂ´ng cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t Ã„â€˜Ã†Â°Ã¡Â»Â£c', 'Danh sÃ¡ch Ä‘Æ¡n vá»‹ khÃ´ng cáº­p nháº­t Ä‘Æ°á»£c'],
  ['LÃƒÂ½ do', 'LÃ½ do'],
  ['TÃ¡ÂºÂ¥t cÃ¡ÂºÂ£ cÃƒÂ¡c Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân Ã„â€˜Ã¡Â»Âu Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t thÃƒÂ nh cÃƒÂ´ng.', 'Táº¥t cáº£ cÃ¡c Ä‘Æ¡n vá»‹ Ä‘Ã£ chá»n Ä‘á»u Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t thÃ nh cÃ´ng.'],
  ['CÃƒÂ¡c Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n mÃ¡Â»â„¢t phÃ¡ÂºÂ§n', 'CÃ¡c Ä‘Æ¡n vá»‹ tiáº¿p nháº­n má»™t pháº§n'],
];

function normalizeIntakeDisplayText(value: string) {
  let next = value;
  for (const [bad, good] of INTAKE_TEXT_REPLACEMENTS) {
    next = next.split(bad).join(good);
  }
  return next;
}

function extractSearchText(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  return [relativePath, file.name].filter(Boolean).join(' ');
}

function findBestUnitMatch(searchText: string, units: ManagedUnit[]): UnitMatchResult | null {
  if (!searchText.trim()) {
    return null;
  }

  const normalizedSearch = normalizeText(searchText);
  const upperSearch = searchText.toUpperCase();

  const codeMatch = units.find((unit) => {
    const pattern = new RegExp(`(^|[^A-Z0-9])${unit.code.toUpperCase()}([^A-Z0-9]|$)`);
    return pattern.test(upperSearch);
  });

  if (codeMatch) {
    return {
      unitCode: codeMatch.code,
      unitName: codeMatch.name,
      type: 'CODE',
      score: 1,
      reason: `KhÃ¡Â»â€ºp theo mÃƒÂ£ Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ ${codeMatch.code}.`,
    };
  }

  const searchTokens = tokenize(searchText);
  if (searchTokens.length === 0) {
    return null;
  }

  let bestMatch: UnitMatchResult | null = null;

  units.forEach((unit) => {
    const normalizedUnit = normalizeText(unit.name);
    const unitTokens = tokenize(unit.name);
    if (unitTokens.length === 0) {
      return;
    }

    if (normalizedSearch.includes(normalizedUnit) || normalizedUnit.includes(normalizedSearch)) {
      const score = normalizedSearch === normalizedUnit ? 0.99 : 0.95;
      const next: UnitMatchResult = {
        unitCode: unit.code,
        unitName: unit.name,
        type: 'NAME',
        score,
        reason: 'KhÃ¡Â»â€ºp mÃ¡ÂºÂ¡nh theo tÃƒÂªn Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹.',
      };
      if (!bestMatch || next.score > bestMatch.score) {
        bestMatch = next;
      }
      return;
    }

    const tokenSet = new Set(searchTokens);
    const overlap = unitTokens.filter((token) => tokenSet.has(token)).length;
    if (overlap === 0) {
      return;
    }

    const coverage = overlap / unitTokens.length;
    const precision = overlap / Math.max(searchTokens.length, 1);
    const score = coverage * 0.75 + precision * 0.25;
    const next: UnitMatchResult = {
      unitCode: unit.code,
      unitName: unit.name,
      type: 'FUZZY',
      score,
      reason: `G?i ? g?n ??ng ${Math.round(score * 100)}%.`,
    };

    if (!bestMatch || next.score > bestMatch.score) {
      bestMatch = next;
    }
  });

  return bestMatch;
}

function getMatchBadgeLabel(fileItem: PendingFile) {
  switch (fileItem.matchStatus) {
    case 'AUTO_FILLED':
      if (fileItem.matchType === 'CODE') return '?? t? ?i?n theo m?';
      if (fileItem.matchType === 'NAME') return '?? t? ?i?n theo t?n';
      return '?? t? ?i?n';
    case 'NEEDS_CONFIRMATION':
      return `C?n x?c nh?n ${Math.round(fileItem.matchScore * 100)}%`;
    case 'MANUAL':
      return '?? ch?n th? c?ng';
    case 'CONFLICT':
      return '??n v? ?? c? d? li?u';
    default:
      return 'Ch?a nh?n di?n';
  }
}

function getMatchBadgeTone(fileItem: PendingFile) {
  switch (fileItem.matchStatus) {
    case 'AUTO_FILLED':
    case 'MANUAL':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'NEEDS_CONFIRMATION':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'CONFLICT':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    default:
      return 'border-[var(--line)] bg-white text-[var(--ink-soft)]';
  }
}

function buildPendingFiles(
  incomingFiles: File[],
  existingFiles: PendingFile[],
  availableUnits: ManagedUnit[],
  importedUnitCodesForProjectYear: Set<string>,
): PendingFile[] {
  const reservedUnitCodes = new Set([
    ...Array.from(importedUnitCodesForProjectYear),
    ...existingFiles.map((item) => item.unitCode).filter(Boolean),
  ]);

  return incomingFiles.map((file) => {
    const match = findBestUnitMatch(extractSearchText(file), availableUnits);
    const baseItem: PendingFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || '',
      unitCode: '',
      unitQuery: '',
      suggestedUnitCode: '',
      suggestedUnitName: '',
      matchType: 'NONE',
      matchStatus: 'UNMATCHED',
      matchScore: 0,
      matchReason: 'Ch?a nh?n di?n ???c ??n v? t? t?n file.',
    };

    if (!match) {
      return baseItem;
    }

    if (reservedUnitCodes.has(match.unitCode)) {
      return {
        ...baseItem,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        unitQuery: match.unitName,
        matchType: match.type,
        matchStatus: 'CONFLICT',
        matchScore: match.score,
        matchReason: `${match.reason} ??n v? n?y ?? c? d? li?u trong d? ?n/n?m ?ang ch?n ho?c ?? ???c ch?n trong ??t hi?n t?i.`,
      };
    }

    if (match.type === 'CODE' || match.type === 'NAME' || match.score >= 0.92) {
      reservedUnitCodes.add(match.unitCode);
      return {
        ...baseItem,
        unitCode: match.unitCode,
        unitQuery: match.unitName,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        matchType: match.type,
        matchStatus: 'AUTO_FILLED',
        matchScore: match.score,
        matchReason: match.reason,
      };
    }

    if (match.score >= 0.82) {
      return {
        ...baseItem,
        unitQuery: match.unitName,
        suggestedUnitCode: match.unitCode,
        suggestedUnitName: match.unitName,
        matchType: match.type,
        matchStatus: 'NEEDS_CONFIRMATION',
        matchScore: match.score,
        matchReason: match.reason,
      };
    }

    return baseItem;
  });
}

function sanitizeStorageName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function uploadAcceptedDataFile(
  fileItem: PendingFile,
  projectId: string,
  unitCode: string,
  year: string,
  unitName: string,
) {
  const extension = fileItem.file.name.split('.').pop() || 'xlsx';
  const safeUnitName = sanitizeStorageName(unitName) || fileItem.unitCode;
  const fileName = `${unitCode}_${safeUnitName || fileItem.unitCode}.${extension}`;
  const renamedFile = new File([fileItem.file], fileName, {
    type: fileItem.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const uploadResult = await uploadFile(renamedFile, {
    folder: `data_files/${projectId}`,
    fileName,
    upsert: true,
  });

  await upsertDataFileRecord({
    projectId,
    unitCode,
    unitName,
    year,
    fileName,
    storagePath: uploadResult.path,
    downloadURL: uploadResult.publicUrl,
  });
}

async function uploadOverwriteRequestFile(
  fileItem: PendingFile,
  projectId: string,
  unitCode: string,
  year: string,
  unitName: string,
) {
  const extension = fileItem.file.name.split('.').pop() || 'xlsx';
  const safeUnitName = sanitizeStorageName(unitName) || fileItem.unitCode;
  const fileName = `${unitCode}_${safeUnitName || fileItem.unitCode}_${year}_overwrite_request.${extension}`;
  const renamedFile = new File([fileItem.file], fileName, {
    type: fileItem.file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return uploadFile(renamedFile, {
    folder: `overwrite_requests/${projectId}`,
    fileName,
    upsert: true,
  });
}

function getFileUnitCode(item: PendingFile) {
  return item.unitCode || item.suggestedUnitCode || '';
}

export function ImportFiles({
  onDataImported,
  onDeleteUnitData,
  onDeleteYearData,
  onDeleteProjectData,
  projects,
  data,
  dataFiles,
  units,
  selectedProjectId,
  onSelectProject,
  templates,
  canManageData,
  isAuthenticated,
  isAdmin,
  assignments,
  currentUser,
}: {
  onDataImported: (rows: DataRow[]) => Promise<void>;
  onDeleteUnitData: (year: string, unitCode: string) => Promise<number>;
  onDeleteYearData: (year: string) => Promise<number>;
  onDeleteProjectData: (projectId: string) => Promise<number>;
  projects: Project[];
  data: Record<string, DataRow[]>;
  dataFiles: DataFileRecordSummary[];
  units: ManagedUnit[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  templates: FormTemplate[];
  canManageData: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  assignments: Record<string, string[]>;
  currentUser: UserProfile | null;
}) {
  const [selectedYear, setSelectedYear] = useState(getPreferredReportingYear());
  const [pinnedYear, setPinnedYear] = useState<string | null>(getPinnedYearPreference());
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileValidation, setFileValidation] = useState<Record<string, FileValidationState>>({});
  const [selectedUnitToDelete, setSelectedUnitToDelete] = useState('');
  const [managementMessage, setManagementMessage] = useState<string | null>(null);
  const [isManagingData, setIsManagingData] = useState(false);
  const [visibleFileFilter, setVisibleFileFilter] = useState<VisibleFileFilter>('ALL');
  const [lastFailedFiles, setLastFailedFiles] = useState<FailedFile[]>([]);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);
  const [importResultSummary, setImportResultSummary] = useState<ImportResultSummary | null>(null);
  const [overwriteRequests, setOverwriteRequests] = useState<OverwriteRequestRecord[]>([]);
  const [overwriteReviewNote, setOverwriteReviewNote] = useState<Record<string, string>>({});
  const [overwriteApprovedIds, setOverwriteApprovedIds] = useState<Record<string, boolean>>({});
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isUnitUser = currentUser?.role === 'unit_user';
  const canOverwriteDirectly = isAdmin && !isUnitUser;

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const projectTemplates = useMemo(
    () => templates.filter((template) => template.projectId === selectedProjectId),
    [selectedProjectId, templates],
  );

  const publishedTemplates = useMemo(
    () => projectTemplates.filter((template) => template.isPublished),
    [projectTemplates],
  );

  const activeTemplates = useMemo(() => {
    if (!selectedTemplateId) {
      return publishedTemplates;
    }
    return publishedTemplates.filter((template) => template.id === selectedTemplateId);
  }, [publishedTemplates, selectedTemplateId]);

  const currentAssignmentKey = useMemo(() => getAssignmentKey(currentUser?.email), [currentUser?.email]);
  const currentAssignedUnitCodes = useMemo(
    () => (currentAssignmentKey ? assignments[currentAssignmentKey] || [] : []),
    [assignments, currentAssignmentKey],
  );

  const sortedUnits = useMemo(
    () => [...units].sort((left, right) => left.name.localeCompare(right.name, 'vi')),
    [units],
  );

  const scopedUnits = useMemo(() => {
    if (!isAuthenticated) {
      return [] as ManagedUnit[];
    }

    if (isUnitUser && currentUser?.unitCode) {
      return sortedUnits.filter((unit) => unit.code === currentUser.unitCode);
    }

    if (isAdmin) {
      return sortedUnits;
    }

    if (currentAssignedUnitCodes.length === 0) {
      return [] as ManagedUnit[];
    }

    const allowed = new Set(currentAssignedUnitCodes);
    return sortedUnits.filter((unit) => allowed.has(unit.code));
  }, [currentAssignedUnitCodes, currentUser?.unitCode, isAdmin, isAuthenticated, isUnitUser, sortedUnits]);

  const unitNameByCode = useMemo(
    () =>
      Object.fromEntries(
        sortedUnits.map((unit) => [unit.code, unit.name]),
      ) as Record<string, string>,
    [sortedUnits],
  );

  const rowsForYear = useMemo(() => {
    const rows = Object.values(data).flat();
    return rows.filter((row) => row.projectId === selectedProjectId && row.year === selectedYear);
  }, [data, selectedProjectId, selectedYear]);

  const unitCodesWithStoredData = useMemo(() => {
    const codes = new Set<string>();

    dataFiles.forEach((file) => {
      if (file.projectId === selectedProjectId && file.year === selectedYear && file.unitCode) {
        codes.add(file.unitCode);
      }
    });

    rowsForYear.forEach((row) => {
      if (row.unitCode) {
        codes.add(row.unitCode);
      }
    });

    return codes;
  }, [dataFiles, rowsForYear, selectedProjectId, selectedYear]);

  const unitIntakeStatuses = useMemo<IntakeUnitStatus[]>(() => {
    return scopedUnits
      .map((unit) => {
        const unitRows = rowsForYear.filter((row) => row.unitCode === unit.code);
        const isSubmitted = unitCodesWithStoredData.has(unit.code) || unitRows.length > 0;
        return {
          code: unit.code,
          name: unit.name,
          rowCount: unitRows.length,
          isSubmitted,
        };
      })
      .sort((left, right) => {
        if (left.isSubmitted !== right.isSubmitted) {
          return Number(left.isSubmitted) - Number(right.isSubmitted);
        }
        return left.name.localeCompare(right.name, 'vi');
      });
  }, [rowsForYear, scopedUnits, unitCodesWithStoredData]);

  const pendingUnits = useMemo(
    () => unitIntakeStatuses.filter((unit) => !unit.isSubmitted),
    [unitIntakeStatuses],
  );

  useEffect(() => {
    if (selectedTemplateId && !publishedTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(publishedTemplates[0]?.id || '');
    }
  }, [publishedTemplates, selectedTemplateId]);

  useEffect(() => {
    const currentPinned = getPinnedYearPreference();
    setPinnedYear(currentPinned);
    if (currentPinned && YEARS.includes(currentPinned)) {
      setSelectedYear(currentPinned);
    }
  }, []);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    if (!selectedProjectId || !isAuthenticated) {
      setOverwriteRequests([]);
      return;
    }

    let cancelled = false;
    listOverwriteRequests(selectedProjectId)
      .then((items) => {
        if (!cancelled) {
          setOverwriteRequests(items);
        }
      })
      .catch((error) => {
        console.error('KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ£i yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨ dÃ¡Â»Â¯ liÃ¡Â»â€¡u:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedProjectId]);

  useEffect(() => {
    let isCancelled = false;

    if (files.length === 0) {
      setFileValidation({});
      return undefined;
    }

    setFileValidation((current) => {
      const next = { ...current };
      files.forEach((item) => {
        next[item.id] = next[item.id] || {
          status: 'pending',
          missingSheets: [],
          matchedSheets: [],
        };
      });
      Object.keys(next).forEach((id) => {
        if (!files.some((item) => item.id === id)) {
          delete next[id];
        }
      });
      return next;
    });

    Promise.all(
      files.map(async (item) => {
        try {
          const buffer = await item.file.arrayBuffer();
          const workbook = XLSX.read(buffer, {
            type: 'array',
            cellFormula: true,
            cellHTML: false,
            cellText: false,
          });

          const validation = validateWorkbookSheetNames(workbook.SheetNames, activeTemplates);
          const matchedTemplates = resolveTemplatesForWorkbook(workbook);
          const matchedSheets = matchedTemplates.map((template) => template.sheetName);

          if (validation.missingSheets.length > 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: validation.missingSheets,
                matchedSheets,
                reason: 'ThiÃ¡ÂºÂ¿u biÃ¡Â»Æ’u mÃ¡ÂºÂ«u bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n.',
              } satisfies FileValidationState,
            ] as const;
          }

          if (matchedTemplates.length === 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: [],
                matchedSheets: [],
                reason: 'KhÃƒÂ´ng cÃƒÂ³ sheet nÃƒÂ o trÃƒÂ¹ng tÃƒÂªn biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t.',
              } satisfies FileValidationState,
            ] as const;
          }

          const signatureErrors = collectTemplateSignatureErrors(workbook, matchedTemplates);
          if (signatureErrors.length > 0) {
            return [
              item.id,
              {
                status: 'invalid',
                missingSheets: [],
                matchedSheets,
                reason: signatureErrors.map((item) => item.validation.reason).filter(Boolean).join(' | '),
              } satisfies FileValidationState,
            ] as const;
          }

          return [
            item.id,
            {
              status: 'valid',
              missingSheets: [],
              matchedSheets,
            } satisfies FileValidationState,
          ] as const;
        } catch (error) {
          return [
            item.id,
            {
              status: 'invalid',
              missingSheets: [],
              matchedSheets: [],
              reason: error instanceof Error ? error.message : 'KhÃƒÂ´ng Ã„â€˜Ã¡Â»Âc Ã„â€˜Ã†Â°Ã¡Â»Â£c file Excel.',
            } satisfies FileValidationState,
          ] as const;
        }
      }),
    ).then((entries) => {
      if (isCancelled) {
        return;
      }

      setFileValidation((current) => {
        const next = { ...current };
        entries.forEach(([id, state]) => {
          next[id] = state;
        });
        return next;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [activeTemplates, files]);

  const appendFiles = (incomingFiles: FileList | File[]) => {
    let nextFiles = Array.from(incomingFiles).filter((file) => /\.(xlsx|xlsm|xls)$/i.test(file.name));
    if (nextFiles.length === 0) {
      return;
    }

    if (isUnitUser) {
      nextFiles = nextFiles.slice(0, 1);
    }

    setFiles((current) => {
      const seededFiles = buildPendingFiles(nextFiles, isUnitUser ? [] : current, scopedUnits, unitCodesWithStoredData).map((item) => {
        if (!isUnitUser || !currentUser?.unitCode) {
          return item;
        }

        return {
          ...item,
          unitCode: currentUser.unitCode,
          unitQuery: currentUser.unitName || unitNameByCode[currentUser.unitCode] || currentUser.unitCode,
          suggestedUnitCode: currentUser.unitCode,
          suggestedUnitName: currentUser.unitName || unitNameByCode[currentUser.unitCode] || currentUser.unitCode,
          matchType: 'MANUAL' as const,
          matchStatus: unitCodesWithStoredData.has(currentUser.unitCode) ? ('CONFLICT' as const) : ('MANUAL' as const),
          matchScore: 1,
          matchReason: unitCodesWithStoredData.has(currentUser.unitCode)
            ? 'Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ cÃ¡Â»Â§a tÃƒÂ i khoÃ¡ÂºÂ£n nÃƒÂ y Ã„â€˜ÃƒÂ£ cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u trong dÃ¡Â»Â± ÃƒÂ¡n/nÃ„Æ’m Ã„â€˜ang chÃ¡Â»Ân. NÃ¡Â»â„¢p file mÃ¡Â»â€ºi sÃ¡ÂºÂ½ chuyÃ¡Â»Æ’n sang yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨ chÃ¡Â»Â admin phÃƒÂª duyÃ¡Â»â€¡t.'
            : 'HÃ¡Â»â€¡ thÃ¡Â»â€˜ng tÃ¡Â»Â± gÃ¡ÂºÂ¯n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ theo tÃƒÂ i khoÃ¡ÂºÂ£n Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p.',
        };
      });

      return isUnitUser ? seededFiles : [...current, ...seededFiles];
    });
    setManagementMessage(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(event.target.files);
      event.target.value = '';
    }
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(event.target.files);
      event.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((item) => item.id !== id));
    setFileValidation((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setOverwriteApprovedIds((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const toggleOverwriteApproval = (id: string) => {
    const targetFile = files.find((item) => item.id === id);
    if (!targetFile) {
      return;
    }

    const nextValue = !overwriteApprovedIds[id];
    if (
      nextValue &&
      !window.confirm(
        'ÄÆ¡n vá»‹ nÃ y Ä‘Ã£ cÃ³ dá»¯ liá»‡u. Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n cho phÃ©p ghi Ä‘Ã¨ dá»¯ liá»‡u hiá»‡n cÃ³ khi xá»­ lÃ½ file nÃ y khÃ´ng?',
      )
    ) {
      return;
    }

    setOverwriteApprovedIds((current) => ({
      ...current,
      [id]: nextValue,
    }));
  };

  const updateUnit = (id: string, unitCode: string) => {
    setFiles((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (!unitCode) {
          return {
            ...item,
            unitCode: '',
            matchStatus: 'UNMATCHED',
            matchType: 'NONE',
            matchReason: 'ChÃ†Â°a nhÃ¡ÂºÂ­n diÃ¡Â»â€¡n Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ tÃ¡Â»Â« tÃƒÂªn file.',
          };
        }

        const hasExistingData = unitCodesWithStoredData.has(unitCode);
        return {
          ...item,
          unitCode,
          unitQuery: unitNameByCode[unitCode] || '',
          matchType: 'MANUAL',
          matchStatus: hasExistingData ? 'CONFLICT' : 'MANUAL',
          matchReason: hasExistingData
            ? 'Ã„ÂÃ†Â¡n vÃ¡Â»â€¹ nÃƒÂ y Ã„â€˜ÃƒÂ£ cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u trong hÃ¡Â»â€¡ thÃ¡Â»â€˜ng cho dÃ¡Â»Â± ÃƒÂ¡n/nÃ„Æ’m Ã„â€˜ang chÃ¡Â»Ân.'
            : 'NgÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ thÃ¡Â»Â§ cÃƒÂ´ng.',
        };
      }),
    );
  };

  const updateUnitInput = (id: string, value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const takenUnitCodes = new Set(
      files.filter((item) => item.id !== id).map((item) => item.unitCode).filter(Boolean),
    );
    const availableUnitsForCurrentFile = scopedUnits.filter(
      (unit) => (canOverwriteDirectly || !unitCodesWithStoredData.has(unit.code)) && !takenUnitCodes.has(unit.code),
    );
    const matchedUnit = availableUnitsForCurrentFile.find((unit) => {
      const matchesName = unit.name.trim().toLowerCase() === normalizedValue;
      const matchesCode = unit.code.trim().toLowerCase() === normalizedValue;
      return matchesName || matchesCode;
    });

    setFiles((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              unitQuery: value,
              unitCode: matchedUnit?.code || '',
              matchType: matchedUnit ? 'MANUAL' : item.matchType,
              matchStatus: matchedUnit ? 'MANUAL' : item.matchStatus,
              matchReason: matchedUnit
                ? 'NgÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng Ã„â€˜ÃƒÂ£ xÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ bÃ¡ÂºÂ±ng cÃƒÂ¡ch nhÃ¡ÂºÂ­p trÃ¡Â»Â±c tiÃ¡ÂºÂ¿p.'
                : item.matchReason,
            }
          : item,
      ),
    );
  };

  const handleConfirmSuggested = () => {
    let confirmedCount = 0;
    const reserved = new Set<string>(Array.from(unitCodesWithStoredData));

    setFiles((current) =>
      current.map((item) => {
        if (item.matchStatus === 'NEEDS_CONFIRMATION' && item.suggestedUnitCode && !reserved.has(item.suggestedUnitCode)) {
          reserved.add(item.suggestedUnitCode);
          confirmedCount += 1;
          return {
            ...item,
            unitCode: item.suggestedUnitCode,
            unitQuery: item.suggestedUnitName,
            matchType: 'MANUAL',
            matchStatus: 'MANUAL',
            matchReason: 'Ã„ÂÃƒÂ£ xÃƒÂ¡c nhÃ¡ÂºÂ­n tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng tÃ¡Â»Â« gÃ¡Â»Â£i ÃƒÂ½ hÃ¡Â»Â£p lÃ¡Â»â€¡.',
          };
        }

        if (item.unitCode) {
          reserved.add(item.unitCode);
        }

        return item;
      }),
    );

    setManagementMessage(
      confirmedCount > 0
        ? `Ã„ÂÃƒÂ£ xÃƒÂ¡c nhÃ¡ÂºÂ­n ${confirmedCount} gÃ¡Â»Â£i ÃƒÂ½ hÃ¡Â»Â£p lÃ¡Â»â€¡.`
        : 'KhÃƒÂ´ng cÃƒÂ³ gÃ¡Â»Â£i ÃƒÂ½ hÃ¡Â»Â£p lÃ¡Â»â€¡ nÃƒÂ o Ã„â€˜Ã¡Â»Æ’ xÃƒÂ¡c nhÃ¡ÂºÂ­n thÃƒÂªm.',
    );
  };

  const exportFailedFiles = () => {
    if (lastFailedFiles.length === 0) {
      setManagementMessage('ChÃ†Â°a cÃƒÂ³ danh sÃƒÂ¡ch file lÃ¡Â»â€”i Ã„â€˜Ã¡Â»Æ’ xuÃ¡ÂºÂ¥t.');
      return;
    }

    const rows = [
      ['TÃƒÂªn Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹', 'TÃƒÂªn file', 'ThiÃ¡ÂºÂ¿u sheet', 'LÃƒÂ½ do', 'Ã„ÂÃ†Â°Ã¡Â»Âng dÃ¡ÂºÂ«n tÃ†Â°Ã†Â¡ng Ã„â€˜Ã¡Â»â€˜i'],
      ...lastFailedFiles.map((item) => [
        item.unitName,
        item.fileName,
        item.missingSheets.join(', '),
        item.reason || '',
        item.relativePath || '',
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'File loi');
    XLSX.writeFile(workbook, `danh_sach_file_loi_${selectedProjectId || 'du_an'}.xlsx`);
    setManagementMessage('Ã„ÂÃƒÂ£ xuÃ¡ÂºÂ¥t danh sÃƒÂ¡ch file lÃ¡Â»â€”i ra Excel.');
  };

  const handleYearChange = (nextYear: string) => {
    setSelectedYear(nextYear);
    if (pinnedYear) {
      setPinnedYear(nextYear);
      setPinnedYearPreference(nextYear);
    }
  };

  const togglePinnedYear = () => {
    if (pinnedYear === selectedYear) {
      setPinnedYear(null);
      setPinnedYearPreference(null);
      return;
    }

    setPinnedYear(selectedYear);
    setPinnedYearPreference(selectedYear);
  };

  const resolveTemplatesForWorkbook = (workbook: XLSX.WorkBook) =>
    activeTemplates.filter((template) => workbook.SheetNames.includes(template.sheetName));

  const collectTemplateSignatureErrors = (workbook: XLSX.WorkBook, templatesToCheck: FormTemplate[]) =>
    templatesToCheck
      .map((template) => ({
        template,
        validation: validateTemplateSheetSignature(workbook, template),
      }))
      .filter((item) => !item.validation.isValid);

  const showProgress = (title: string, description: string, percent: number) => {
    setOperationProgress({
      visible: true,
      title,
      description,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      status: 'running',
    });
  };

  const completeProgress = (title: string, description: string) => {
    setOperationProgress({
      visible: true,
      title,
      description,
      percent: 100,
      status: 'done',
    });
  };

  const closeProgress = () => {
    setOperationProgress(null);
  };

  const closeImportResultSummary = () => {
    setImportResultSummary(null);
  };

  const parseRowsForTemplate = (workbook: XLSX.WorkBook, template: FormTemplate, unitCode: string, year: string) => {
    if (template.mode === 'LEGACY') {
      return parseLegacyFromWorkbook(
        workbook,
        unitCode,
        year,
        template.legacyConfigName || template.sheetName,
        template.projectId,
        template.id,
      );
    }

    return parseTemplateFromWorkbook(workbook, template, unitCode, year);
  };

  const refreshOverwriteRequests = async () => {
    if (!selectedProjectId || !isAuthenticated) {
      setOverwriteRequests([]);
      return;
    }

    const items = await listOverwriteRequests(selectedProjectId);
    setOverwriteRequests(items);
  };

  const handleReviewOverwriteRequest = async (
    request: OverwriteRequestRecord,
    decision: 'APPROVED' | 'REJECTED',
  ) => {
    if (!isAdmin || !currentUser) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      if (decision === 'APPROVED') {
        await onDeleteUnitData(request.year, request.unitCode);
        await upsertDataFileRecord({
          projectId: request.projectId,
          unitCode: request.unitCode,
          unitName: request.unitName,
          year: request.year,
          fileName: request.fileName,
          storagePath: request.storagePath,
          downloadURL: request.downloadURL || '',
        });
        await onDataImported(request.rowPayload || []);
      }

      await updateOverwriteRequestDecision({
        requestId: request.id,
        status: decision,
        reviewNote: overwriteReviewNote[request.id] || null,
        reviewedBy: {
          uid: currentUser.id,
          email: currentUser.email,
          displayName: currentUser.displayName,
        },
      });

      await refreshOverwriteRequests();
      setManagementMessage(
        decision === 'APPROVED'
          ? `Ã„ÂÃƒÂ£ phÃƒÂª duyÃ¡Â»â€¡t yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨ cho ${request.unitName} (${request.year}).`
          : `Ã„ÂÃƒÂ£ tÃ¡Â»Â« chÃ¡Â»â€˜i yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨ cho ${request.unitName} (${request.year}).`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃ¡Â»Â­ lÃƒÂ½ yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨.');
    } finally {
      setIsManagingData(false);
    }
  };

  const processFiles = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lÃƒÂ²ng chÃ¡Â»Ân dÃ¡Â»Â± ÃƒÂ¡n trÃ†Â°Ã¡Â»â€ºc khi tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
      return;
    }

    if (publishedTemplates.length === 0) {
      const message =
        projectTemplates.length === 0
          ? 'DÃ¡Â»Â± ÃƒÂ¡n nÃƒÂ y chÃ†Â°a cÃƒÂ³ biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜Ã¡Â»Æ’ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n dÃ¡Â»Â¯ liÃ¡Â»â€¡u.'
          : 'DÃ¡Â»Â± ÃƒÂ¡n nÃƒÂ y Ã„â€˜ÃƒÂ£ cÃƒÂ³ biÃ¡Â»Æ’u mÃ¡ÂºÂ«u nhÃ†Â°ng chÃ†Â°a chÃ¡Â»â€˜t mÃ¡ÂºÂ«u nÃƒÂ o. HÃƒÂ£y vÃƒÂ o mÃ¡Â»Â¥c BiÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜Ã¡Â»Æ’ chÃ¡Â»â€˜t trÃ†Â°Ã¡Â»â€ºc khi tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n dÃ¡Â»Â¯ liÃ¡Â»â€¡u.';
      setManagementMessage(message);
      return;
    }

    if (activeTemplates.length === 0) {
      setManagementMessage('BiÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân khÃƒÂ´ng cÃƒÂ²n hiÃ¡Â»â€¡u lÃ¡Â»Â±c. Vui lÃƒÂ²ng chÃ¡Â»Ân lÃ¡ÂºÂ¡i biÃ¡Â»Æ’u mÃ¡ÂºÂ«u cÃ¡ÂºÂ§n tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n.');
      return;
    }

    if (files.length === 0) {
      setManagementMessage('Vui lÃƒÂ²ng chÃ¡Â»Ân ÃƒÂ­t nhÃ¡ÂºÂ¥t mÃ¡Â»â„¢t file Excel Ã„â€˜Ã¡Â»Æ’ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n.');
      return;
    }

    const importYear = selectedYear;
    setIsManagingData(true);
    setManagementMessage(null);
    setLastFailedFiles([]);
    showProgress('Ã„Âang tÃ¡Â»â€¢ng hÃ¡Â»Â£p dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'Ã„Âang chuÃ¡ÂºÂ©n bÃ¡Â»â€¹ Ã„â€˜Ã¡Â»Âc cÃƒÂ¡c file Excel...', 3);

    try {
      const importedRows: DataRow[] = [];
      const failedFiles: FailedFile[] = [];
      const partialWarnings: string[] = [];
      const completedFileKeys = new Set<string>();
      let acceptedFiles = 0;
      const totalSelected = files.length;
      const totalFiles = Math.max(files.length, 1);

      for (const [index, fileItem] of files.entries()) {
        showProgress(
          'Ã„Âang tÃ¡Â»â€¢ng hÃ¡Â»Â£p dÃ¡Â»Â¯ liÃ¡Â»â€¡u',
          `Ã„Âang xÃ¡Â»Â­ lÃƒÂ½ file ${index + 1}/${files.length}: ${fileItem.file.name}`,
          5 + ((index + 0.25) / totalFiles) * 75,
        );
        const unitName = unitNameByCode[fileItem.unitCode] || fileItem.unitQuery || fileItem.file.name;

        if (!fileItem.unitCode) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'ChÃ†Â°a xÃƒÂ¡c nhÃ¡ÂºÂ­n Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ cho file nÃƒÂ y.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const validation = fileValidation[fileItem.id];
        if (validation?.status === 'invalid') {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: validation.missingSheets,
            reason: validation.reason,
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const buffer = await fileItem.file.arrayBuffer();
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellFormula: true,
          cellHTML: false,
          cellText: false,
        });
        showProgress(
          'Ã„Âang tÃ¡Â»â€¢ng hÃ¡Â»Â£p dÃ¡Â»Â¯ liÃ¡Â»â€¡u',
          `Ã„ÂÃƒÂ£ Ã„â€˜Ã¡Â»Âc file ${index + 1}/${files.length}, Ã„â€˜ang kiÃ¡Â»Æ’m tra sheet vÃƒÂ  lÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u...`,
          5 + ((index + 0.6) / totalFiles) * 75,
        );

        const sheetValidation = validateWorkbookSheetNames(workbook.SheetNames, activeTemplates);
        if (sheetValidation.missingSheets.length > 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: sheetValidation.missingSheets,
            reason: 'ThiÃ¡ÂºÂ¿u biÃ¡Â»Æ’u mÃ¡ÂºÂ«u bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const matchedTemplates = resolveTemplatesForWorkbook(workbook);
        if (matchedTemplates.length === 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: 'KhÃƒÂ´ng cÃƒÂ³ sheet nÃƒÂ o trÃƒÂ¹ng tÃƒÂªn biÃ¡Â»Æ’u mÃ¡ÂºÂ«u Ã„â€˜ÃƒÂ£ chÃ¡Â»â€˜t.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const signatureErrors = collectTemplateSignatureErrors(workbook, matchedTemplates);
        if (signatureErrors.length > 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason: signatureErrors.map((item) => item.validation.reason).filter(Boolean).join(' | '),
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const parsedRowsForFile: DataRow[] = [];
        const templateErrors: string[] = [];

        matchedTemplates.forEach((template) => {
          try {
            parsedRowsForFile.push(...parseRowsForTemplate(workbook, template, fileItem.unitCode, importYear));
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'LÃ¡Â»â€”i khÃƒÂ´ng xÃƒÂ¡c Ã„â€˜Ã¡Â»â€¹nh.';
            templateErrors.push(`${template.name}: ${reason}`);
          }
        });

        if (parsedRowsForFile.length === 0) {
          failedFiles.push({
            unitName,
            fileName: fileItem.file.name,
            missingSheets: [],
            reason:
              templateErrors.length > 0
                ? `KhÃƒÂ´ng Ã„â€˜Ã¡Â»Âc Ã„â€˜Ã†Â°Ã¡Â»Â£c dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« biÃ¡Â»Æ’u Ã„â€˜ÃƒÂ£ khÃ¡Â»â€ºp. ${templateErrors.join(' | ')}`
                : 'KhÃƒÂ´ng Ã„â€˜Ã¡Â»Âc Ã„â€˜Ã†Â°Ã¡Â»Â£c dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« file.',
            relativePath: fileItem.relativePath,
          });
          continue;
        }

        const unitAlreadyHasData =
          unitCodesWithStoredData.has(fileItem.unitCode) ||
          rowsForYear.some((row) => row.unitCode === fileItem.unitCode);

        if (isUnitUser && unitAlreadyHasData) {
          try {
            const pendingUpload = await uploadOverwriteRequestFile(
              fileItem,
              selectedProjectId,
              fileItem.unitCode,
              importYear,
              unitName,
            );
            await createOverwriteRequest({
              projectId: selectedProjectId,
              projectName: currentProject.name,
              unitCode: fileItem.unitCode,
              unitName,
              year: importYear,
              fileName: fileItem.file.name,
              storagePath: pendingUpload.path,
              downloadURL: pendingUpload.publicUrl,
              rowPayload: parsedRowsForFile,
              requestedBy: currentUser
                ? {
                    uid: currentUser.id,
                    email: currentUser.email,
                    displayName: currentUser.displayName,
                  }
                : null,
              reviewNote: null,
            });
            partialWarnings.push(
              `${unitName} (${fileItem.file.name}) Ã„â€˜ÃƒÂ£ gÃ¡Â»Â­i yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨, chÃ¡Â»Â admin phÃƒÂª duyÃ¡Â»â€¡t trÃ†Â°Ã¡Â»â€ºc khi cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t dÃ¡Â»Â¯ liÃ¡Â»â€¡u.`,
            );
            completedFileKeys.add(`${fileItem.file.name}__${fileItem.relativePath || ''}`);
          } catch (requestError) {
            failedFiles.push({
              unitName,
              fileName: fileItem.file.name,
              missingSheets: [],
              reason:
                requestError instanceof Error
                  ? requestError.message
                  : 'KhÃƒÂ´ng thÃ¡Â»Æ’ tÃ¡ÂºÂ¡o yÃƒÂªu cÃ¡ÂºÂ§u ghi Ã„â€˜ÃƒÂ¨ dÃ¡Â»Â¯ liÃ¡Â»â€¡u.',
              relativePath: fileItem.relativePath,
            });
          }
          continue;
        }

        if (canOverwriteDirectly && unitAlreadyHasData) {
          if (!overwriteApprovedIds[fileItem.id]) {
            failedFiles.push({
              unitName,
              fileName: fileItem.file.name,
              missingSheets: [],
              reason: 'ÄÆ¡n vá»‹ Ä‘Ã£ cÃ³ dá»¯ liá»‡u. HÃ£y báº¥m "Cho phÃ©p ghi Ä‘Ã¨" trÆ°á»›c khi tá»•ng há»£p.',
              relativePath: fileItem.relativePath,
            });
            continue;
          }

          try {
            await onDeleteUnitData(importYear, fileItem.unitCode);
          } catch (overwriteError) {
            failedFiles.push({
              unitName,
              fileName: fileItem.file.name,
              missingSheets: [],
              reason:
                overwriteError instanceof Error
                  ? overwriteError.message
                  : 'KhÃ´ng thá»ƒ ghi Ä‘Ã¨ dá»¯ liá»‡u hiá»‡n cÃ³ cá»§a Ä‘Æ¡n vá»‹ nÃ y.',
              relativePath: fileItem.relativePath,
            });
            continue;
          }
        }

        importedRows.push(...parsedRowsForFile);
        try {
          await uploadAcceptedDataFile(fileItem, selectedProjectId, fileItem.unitCode, importYear, unitName);
        } catch (uploadError) {
          console.error('KhÃƒÂ´ng thÃ¡Â»Æ’ upload file dÃ¡Â»Â¯ liÃ¡Â»â€¡u Ã„â€˜ÃƒÂ£ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n:', uploadError);
        }
        acceptedFiles += 1;
        completedFileKeys.add(`${fileItem.file.name}__${fileItem.relativePath || ''}`);
        if (canOverwriteDirectly && unitAlreadyHasData) {
          partialWarnings.push(`${unitName} (${fileItem.file.name}) Ä‘Ã£ Ä‘Æ°á»£c admin ghi Ä‘Ã¨ dá»¯ liá»‡u hiá»‡n cÃ³.`);
        }
        showProgress(
          'Ã„Âang tÃ¡Â»â€¢ng hÃ¡Â»Â£p dÃ¡Â»Â¯ liÃ¡Â»â€¡u',
          `Ã„ÂÃƒÂ£ xÃ¡Â»Â­ lÃƒÂ½ ${index + 1}/${files.length} file. Ã„Âang tiÃ¡ÂºÂ¿p tÃ¡Â»Â¥c...`,
          5 + ((index + 1) / totalFiles) * 75,
        );

        if (templateErrors.length > 0) {
          partialWarnings.push(
            `${unitName} (${fileItem.file.name}) chÃ¡Â»â€° tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n mÃ¡Â»â„¢t phÃ¡ÂºÂ§n. BÃ¡Â»Â qua: ${templateErrors.join(' | ')}`,
          );
        }
      }

      if (importedRows.length > 0) {
        showProgress('Ã„Âang tÃ¡Â»â€¢ng hÃ¡Â»Â£p dÃ¡Â»Â¯ liÃ¡Â»â€¡u', 'Ã„Âang ghi dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»â€¢ng hÃ¡Â»Â£p vÃƒÂ o hÃ¡Â»â€¡ thÃ¡Â»â€˜ng...', 90);
        await onDataImported(importedRows);
      }

      setLastFailedFiles(failedFiles);

      const summaryLines: string[] = [];
      if (acceptedFiles > 0) {
        summaryLines.push(`Ã„ÂÃƒÂ£ tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n ${acceptedFiles} file hÃ¡Â»Â£p lÃ¡Â»â€¡.`);
      }

      if (failedFiles.length > 0) {
        summaryLines.push('CÃƒÂ¡c file chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n:');
        failedFiles.forEach((item) => {
          const suffix = item.missingSheets.length > 0 ? ` - thiÃ¡ÂºÂ¿u sheet: ${item.missingSheets.join(', ')}` : '';
          summaryLines.push(`- ${item.unitName} (${item.fileName})${suffix}${item.reason ? ` - ${item.reason}` : ''}`);
        });
      }

      if (partialWarnings.length > 0) {
        summaryLines.push('CÃƒÂ¡c file tiÃ¡ÂºÂ¿p nhÃ¡ÂºÂ­n mÃ¡Â»â„¢t phÃ¡ÂºÂ§n:');
        partialWarnings.forEach((warning) => {
          summaryLines.push(`- ${warning}`);
        });
      }

      if (summaryLines.length === 0) {
        summaryLines.push('KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u phÃƒÂ¹ hÃ¡Â»Â£p trong cÃƒÂ¡c file Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân.');
      }

      setManagementMessage(summaryLines.join('\n'));
      setImportResultSummary({
        visible: true,
        totalSelected,
        updatedCount: acceptedFiles,
        failedFiles,
        partialWarnings,
      });
      await refreshOverwriteRequests();
      closeProgress();

      if (completedFileKeys.size > 0) {
        setFiles((current) =>
          current.filter((item) => !completedFileKeys.has(`${item.file.name}__${item.relativePath || ''}`)),
        );
        setOverwriteApprovedIds((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([fileId]) => {
              const fileItem = files.find((item) => item.id === fileId);
              return !fileItem || !completedFileKeys.has(`${fileItem.file.name}__${fileItem.relativePath || ''}`);
            }),
          ),
        );
      }
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ Ã„â€˜Ã¡Â»Âc file Excel nÃƒÂ y.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!selectedUnitToDelete) {
      setManagementMessage('Vui lÃƒÂ²ng chÃ¡Â»Ân Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ cÃ¡ÂºÂ§n xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
      return;
    }

    const yearToDelete = selectedYear;
    const unitName = unitNameByCode[selectedUnitToDelete] || selectedUnitToDelete;
    const confirmed = window.confirm(
      `XÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ "${unitName}" trong nÃ„Æ’m ${yearToDelete} thuÃ¡Â»â„¢c dÃ¡Â»Â± ÃƒÂ¡n hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);

    try {
      const deletedCount = await onDeleteUnitData(yearToDelete, selectedUnitToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `Ã„ÂÃƒÂ£ xÃƒÂ³a ${deletedCount} dÃƒÂ²ng dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ ${unitName} trong nÃ„Æ’m ${yearToDelete}.`
          : `KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹ ${unitName} trong nÃ„Æ’m ${yearToDelete}.`,
      );
    } catch (error) {
      setManagementMessage(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a Ã„â€˜Ã†Â¡n vÃ¡Â»â€¹.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteYear = async () => {
    const yearToDelete = selectedYear;
    const confirmed = window.confirm(`XÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â¯ liÃ¡Â»â€¡u Ã„â€˜ÃƒÂ£ lÃ†Â°u cÃ¡Â»Â§a nÃ„Æ’m ${yearToDelete} trong dÃ¡Â»Â± ÃƒÂ¡n hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i?`);
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);
    showProgress('Ã„Âang xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m', `Ã„Âang chuÃ¡ÂºÂ©n bÃ¡Â»â€¹ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u nÃ„Æ’m ${yearToDelete}...`, 10);

    try {
      showProgress('Ã„Âang xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m', `Ã„Âang xÃƒÂ³a cÃƒÂ¡c dÃƒÂ²ng dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a nÃ„Æ’m ${yearToDelete}...`, 65);
      const deletedCount = await onDeleteYearData(yearToDelete);
      setManagementMessage(
        deletedCount > 0
          ? `Ã„ÂÃƒÂ£ xÃƒÂ³a ${deletedCount} dÃƒÂ²ng dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a nÃ„Æ’m ${yearToDelete}.`
          : `KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u nÃƒÂ o cÃ¡Â»Â§a nÃ„Æ’m ${yearToDelete} Ã„â€˜Ã¡Â»Æ’ xÃƒÂ³a.`,
      );
      completeProgress(
        'HoÃƒÂ n tÃ¡ÂºÂ¥t xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m',
        deletedCount > 0 ? `Ã„ÂÃƒÂ£ xÃ¡Â»Â­ lÃƒÂ½ xong dÃ¡Â»Â¯ liÃ¡Â»â€¡u nÃ„Æ’m ${yearToDelete}.` : `KhÃƒÂ´ng cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u nÃ„Æ’m ${yearToDelete} Ã„â€˜Ã¡Â»Æ’ xÃƒÂ³a.`,
      );
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u theo nÃ„Æ’m.');
    } finally {
      setIsManagingData(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProject) {
      setManagementMessage('Vui lÃƒÂ²ng chÃ¡Â»Ân dÃ¡Â»Â± ÃƒÂ¡n trÃ†Â°Ã¡Â»â€ºc khi xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
      return;
    }

    const confirmed = window.confirm(
      `XÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â¯ liÃ¡Â»â€¡u, biÃ¡Â»Æ’u mÃ¡ÂºÂ«u, phÃƒÂ¢n cÃƒÂ´ng vÃƒÂ  lÃ¡Â»â€¹ch sÃ¡Â»Â­ xuÃ¡ÂºÂ¥t bÃƒÂ¡o cÃƒÂ¡o cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    setIsManagingData(true);
    setManagementMessage(null);
    showProgress('Ã„Âang xÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â± ÃƒÂ¡n', `Ã„Âang chuÃ¡ÂºÂ©n bÃ¡Â»â€¹ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}"...`, 5);

    try {
      showProgress('Ã„Âang xÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â± ÃƒÂ¡n', `Ã„Âang xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u, biÃ¡Â»Æ’u mÃ¡ÂºÂ«u vÃƒÂ  file cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}"...`, 70);
      const deletedCount = await onDeleteProjectData(currentProject.id);
      setManagementMessage(
        deletedCount > 0
          ? `Ã„ÂÃƒÂ£ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}" vÃƒÂ  ${deletedCount - 1} bÃ¡ÂºÂ£n ghi liÃƒÂªn quan.`
          : `KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}".`,
      );
      completeProgress(
        deletedCount > 0 ? 'Ã„ÂÃƒÂ£ xÃƒÂ³a toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â± ÃƒÂ¡n' : 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n',
        deletedCount > 0 ? `DÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}" Ã„â€˜ÃƒÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½ xong.` : `KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â± ÃƒÂ¡n "${currentProject.name}".`,
      );
    } catch (error) {
      closeProgress();
      setManagementMessage(error instanceof Error ? error.message : 'KhÃƒÂ´ng thÃ¡Â»Æ’ xÃƒÂ³a dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a dÃ¡Â»Â± ÃƒÂ¡n.');
    } finally {
      setIsManagingData(false);
    }
  };

  const visibleFiles = useMemo(() => {
    return files.filter((item) => {
      const validation = fileValidation[item.id];
      const fileUnitCode = getFileUnitCode(item);
      const hasExistingData = Boolean(fileUnitCode) && unitCodesWithStoredData.has(fileUnitCode);

      switch (visibleFileFilter) {
        case 'READY':
          return validation?.status === 'valid' && Boolean(item.unitCode);
        case 'NEEDS_CONFIRMATION':
          return (
            item.matchStatus === 'NEEDS_CONFIRMATION' ||
            item.matchStatus === 'UNMATCHED' ||
            item.matchStatus === 'CONFLICT'
          );
        case 'INVALID':
          return validation?.status === 'invalid';
        case 'WITH_EXISTING_DATA':
          return hasExistingData;
        default:
          return true;
      }
    });
  }, [fileValidation, files, unitCodesWithStoredData, visibleFileFilter]);

  const showExportErrors = lastFailedFiles.length > 0;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const touchedNodes: Array<{ node: Text; value: string }> = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.nodeValue?.trim()) {
        continue;
      }

      const repaired = normalizeIntakeDisplayText(repairMojibake(node.nodeValue));
      if (repaired !== node.nodeValue) {
        touchedNodes.push({ node, value: repaired });
      }
    }

    touchedNodes.forEach(({ node, value }) => {
      node.nodeValue = value;
    });

    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]').forEach((element) => {
      const placeholder = element.getAttribute('placeholder');
      if (!placeholder) {
        return;
      }

      const repaired = normalizeIntakeDisplayText(repairMojibake(placeholder));
      if (repaired !== placeholder) {
        element.setAttribute('placeholder', repaired);
      }
    });
  });

  return (
    <>
      <div ref={rootRef} className="space-y-6 p-6 md:p-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="page-title">Ti?p nh?n d? li?u</h2>
            <p className="page-subtitle mt-2">
              Ch?n d? ?n, n?m v? bi?u m?u ph? h?p ?? nh?p d? li?u Excel theo ??ng c?u tr?c ?? ph?t h?nh.
            </p>
          </div>
          {managementMessage && (
            <div className="flex max-w-2xl items-start gap-3 rounded-[20px] border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-soft)] shadow-[0_20px_60px_rgba(122,44,46,0.08)]">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span className="whitespace-pre-line">{managementMessage}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="panel-card min-w-0 rounded-[24px] p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="col-header">1. D? ?n</p>
                      <p className="page-subtitle mt-2 text-sm">
                        Ch?n ??ng d? ?n ?? h? th?ng l?c ??n v? ch?a ti?p nh?n v? c?c bi?u m?u ?? ch?t t??ng ?ng.
                      </p>
                    </div>
                    {currentProject && (
                      <div className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {currentProject.status === 'ACTIVE' ? '?ang ho?t ??ng' : '?? ho?n th?nh'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full max-w-[360px] self-start lg:ml-6">
                  <div className="flex items-end justify-end gap-3">
                    <div className="min-w-[180px]">
                      <div className="mb-1 text-right text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
                        N?m
                      </div>
                      <select
                        value={selectedYear}
                        onChange={(event) => handleYearChange(event.target.value)}
                        className="h-11 w-full border-0 border-b-2 border-[var(--brand)] bg-transparent px-0 text-right text-2xl font-semibold text-[var(--ink)] focus:outline-none"
                      >
                        {YEARS.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <label className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--ink-soft)]">
                    <input type="checkbox" checked={pinnedYear === selectedYear} onChange={togglePinnedYear} />
                    <span>Ghim n?m n?y cho l?n nh?p sau</span>
                  </label>
                </div>
              </div>

            <div className="-mx-1 mt-4 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
              {projects.map((project) => {
                const isActive = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={`min-w-[220px] max-w-full rounded-[18px] border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[var(--brand)] bg-[var(--primary-soft)] shadow-[0_12px_30px_rgba(122,44,46,0.10)]'
                        : 'border-[var(--line)] bg-white hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{project.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--ink-soft)]">
                      {project.description || 'Ch?a c? m? t? d? ?n.'}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    ??n v? ch?a ti?p nh?n
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {pendingUnits.length} ??n v?
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                  {selectedYear}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                Danh s?ch n?y d?ng c?ng logic v?i Nh?t k? v? t? l?c theo d? ?n, n?m v? ph?n quy?n theo d?i.
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto pr-1">
                {pendingUnits.length > 0 ? (
                  pendingUnits.map((unit) => (
                    <div
                      key={unit.code}
                      className="flex items-center justify-between rounded-[16px] border border-[var(--line)] bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{unit.name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {unit.code}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                        Ch?a ti?p nh?n
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[var(--line)] bg-white px-3 py-4 text-sm text-[var(--ink-soft)]">
                    {isUnitUser
                      ? 'ÄÆ¡n vá»‹ cá»§a báº¡n Ä‘Ã£ cÃ³ dá»¯ liá»‡u trong dá»± Ã¡n/nÄƒm Ä‘ang chá»n hoáº·c khÃ´ng cÃ²n má»¥c chÆ°a tiáº¿p nháº­n.'
                      : !isAdmin && currentAssignedUnitCodes.length === 0
                      ? 'T?i kho?n n?y ch?a ???c ph?n c?ng ??n v? theo d?i cho lu?ng ti?p nh?n.'
                      : 'Kh?ng c?n ??n v? n?o ch?a ti?p nh?n trong d? ?n/n?m ?ang ch?n.'}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>

          <div className="panel-card rounded-[24px] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="col-header">2. Bi?u m?u</p>
                <p className="page-subtitle mt-2 text-sm">
                  {selectedTemplateId
                    ? 'H? th?ng ?ang ??i chi?u theo bi?u m?u b?n ch?n. File ch? ???c nh?n khi c? ??ng sheet b?t bu?c c?a bi?u n?y.'
                    : 'Khi ti?p nh?n, h? th?ng s? ??i chi?u to?n b? bi?u m?u ?? ch?t c?a d? ?n. File ch? ???c nh?n khi ?? 100% sheet b?t bu?c; c?c sheet th?a s? t? b? qua.'}
                </p>
              </div>
            </div>

            <div className="-mx-1 mt-4 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setSelectedTemplateId('')}
                className={`relative rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition ${
                  !selectedTemplateId
                    ? 'border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_14px_34px_rgba(122,44,46,0.22)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                }`}
              >
                {!selectedTemplateId && (
                  <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--brand)]">
                    <CheckCircle2 size={14} />
                  </span>
                )}
                <span className="pr-7">T?t c? bi?u m?u ?? ch?t</span>
              </button>
              {publishedTemplates.map((template) => {
                const isActive = template.id === selectedTemplateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`relative min-w-[220px] max-w-full rounded-[18px] border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[var(--brand)] bg-[var(--brand)] text-white shadow-[0_14px_34px_rgba(122,44,46,0.24)]'
                        : 'border-[var(--line)] bg-white hover:border-[var(--brand)] hover:bg-[var(--surface-soft)]'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--brand)]">
                        <CheckCircle2 size={14} />
                      </span>
                    )}
                    <p className={`truncate pr-7 text-sm font-semibold ${isActive ? 'text-white' : 'text-[var(--ink)]'}`}>{template.name}</p>
                    <p className={`mt-1 text-xs ${isActive ? 'text-white/80' : 'text-[var(--ink-soft)]'}`}>{template.sheetName}</p>
                  </button>
                );
              })}
            </div>

            {publishedTemplates.length === 0 && (
              <div className="mt-4 rounded-[16px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                D? ?n n?y ch?a c? bi?u m?u ?? ch?t ?? ti?p nh?n d? li?u.
              </div>
            )}
          </div>

          {canManageData && (
            <div className="panel-card rounded-[24px] p-5">
              <p className="col-header mb-3">3. Qu?n tr? d? li?u theo n?m</p>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <select
                  value={selectedUnitToDelete}
                  onChange={(event) => setSelectedUnitToDelete(event.target.value)}
                  className="field-input h-11 text-base font-semibold"
                >
                  <option value="">-- Ch?n ??n v? --</option>
                  {scopedUnits.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.name} ({unit.code})
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <button
                    onClick={handleDeleteUnit}
                    disabled={isManagingData || !selectedUnitToDelete}
                    className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    X?a d? li?u theo ??n v?
                  </button>
                  <button
                    onClick={handleDeleteYear}
                    disabled={isManagingData}
                    className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    X?a d? li?u theo n?m
                  </button>
                  <button
                    onClick={handleDeleteProject}
                    disabled={isManagingData || !currentProject}
                    className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    X?a to?n b? d? ?n hi?n t?i
                  </button>
                </div>
              </div>
            </div>
          )}

          {canManageData && overwriteRequests.some((request) => request.status === 'PENDING') && (
            <div className="panel-card rounded-[24px] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="col-header">4. Ph? duy?t ghi ?? d? li?u</p>
                  <p className="page-subtitle mt-2 text-sm">
                    ??n v? ?? c? d? li?u mu?n n?p l?i file s? ???c ??a v?o danh s?ch ch? ph? duy?t. Admin duy?t t?i ??y ?? thay th? d? li?u c?.
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                  {overwriteRequests.filter((request) => request.status === 'PENDING').length} y?u c?u ch? duy?t
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {overwriteRequests
                  .filter((request) => request.status === 'PENDING')
                  .map((request) => (
                    <div key={request.id} className="rounded-[20px] border border-amber-200 bg-amber-50/40 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-[var(--ink)]">{request.unitName}</p>
                          <p className="mt-1 text-xs text-[var(--ink-soft)]">
                            {request.fileName} ? {request.year} ? {request.projectName || currentProject?.name || request.projectId}
                          </p>
                          <p className="mt-2 text-xs text-[var(--ink-soft)]">
                            Ng??i g?i: {request.requestedBy?.displayName || request.requestedBy?.email || 'Ch?a x?c ??nh'}
                          </p>
                        </div>
                        <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          Ch? ph? duy?t
                        </div>
                      </div>

                      <textarea
                        value={overwriteReviewNote[request.id] || ''}
                        onChange={(event) =>
                          setOverwriteReviewNote((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Ghi ch? ph? duy?t / t? ch?i"
                        className="mt-3 field-input min-h-[88px] py-3"
                      />

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleReviewOverwriteRequest(request, 'APPROVED')}
                          disabled={isManagingData}
                          className="primary-btn disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Ph? duy?t ghi ??
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewOverwriteRequest(request, 'REJECTED')}
                          disabled={isManagingData}
                          className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          T? ch?i
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="panel-card rounded-[28px] border border-dashed border-[var(--line)] p-4">
          <div className={`grid grid-cols-1 gap-3 ${isUnitUser ? "" : "md:grid-cols-2"}`}>
            <label className="flex min-h-[116px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
                <Upload size={18} />
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--ink)]">K?o th? ho?c b?m ?? ch?n file</p>
              <p className="page-subtitle mt-1 text-xs">
                {isUnitUser ? "T?i kho?n ??n v? ch? n?p 1 file v? h? th?ng t? g?n ??ng ??n v? ??ng nh?p." : "Ph? h?p khi nh?n t?ng file l?."}
              </p>
              <input type="file" multiple={!isUnitUser} accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFileChange} />
            </label>

            {!isUnitUser && (
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex min-h-[116px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-4 py-5 text-center transition hover:border-[var(--brand)] hover:bg-white"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)]">
                  <FolderOpen size={18} />
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Ch?n c? th? m?c d? li?u</p>
                <p className="page-subtitle mt-1 text-xs">H? th?ng s? g?i ? ??n v? t? t?n file trong th? m?c.</p>
              </button>
            )}
          </div>

          {!isUnitUser && (
            <input ref={folderInputRef} type="file" multiple accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleFolderChange} />
          )}
        </div>

        {files.length > 0 && (
          <div className="panel-card rounded-[28px] p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="section-title">Danh s?ch file ch? ti?p nh?n</h3>
                <p className="page-subtitle mt-2 text-sm">
                  {isUnitUser
                    ? 'H? th?ng t? g?n ??n v? theo t?i kho?n ??ng nh?p v? ch? nh?n 1 file m?i l?n g?i.'
                    : 'H? th?ng ?? c? g?ng t? nh?n di?n ??n v? t? t?n file. B?n ch? c?n r? l?i c?c file c?n x?c nh?n.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isUnitUser && (
                  <>
                    <select
                      value={visibleFileFilter}
                      onChange={(event) => setVisibleFileFilter(event.target.value as VisibleFileFilter)}
                      className="field-input h-10 min-w-[250px] text-sm font-semibold"
                    >
                      <option value="ALL">Hi?n t?t c? file</option>
                      <option value="READY">Ch? hi?n file ?? s?n s?ng</option>
                      <option value="NEEDS_CONFIRMATION">Ch? hi?n file c?n x?c nh?n</option>
                      <option value="WITH_EXISTING_DATA">??n v? ?? c? d? li?u</option>
                      <option value="INVALID">Ch? hi?n file l?i sheet</option>
                    </select>
                    <button onClick={handleConfirmSuggested} className="secondary-btn">
                      X?c nh?n t?t c? g?i ? h?p l?
                    </button>
                  </>
                )}
                <button onClick={exportFailedFiles} disabled={!showExportErrors} className="secondary-btn disabled:cursor-not-allowed disabled:opacity-40">
                  Xu?t danh s?ch file l?i
                </button>
                <button onClick={processFiles} disabled={isManagingData} className="primary-btn flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40">
                  {isManagingData ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck size={16} />}
                  {isUnitUser ? 'N?p bi?u b?o c?o' : 'B?t ??u t?ng h?p'}
                </button>
              </div>
            </div>

            {!isUnitUser && (
              <div className="mb-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
                B? l?c <strong>??n v? ?? c? d? li?u</strong> ?ang d?ng c?ng ?i?u ki?n v?i Nh?t k?:
                d? ?n hi?n t?i, n?m ?ang ch?n, ??n v? trong ph?m vi ph?n quy?n, v? t?n t?i d? li?u trong <code>data_files</code> ho?c <code>consolidated_rows</code>.
              </div>
            )}

            <div className="space-y-4">
              {visibleFiles.map((item) => {
                const validation = fileValidation[item.id];
                const takenUnitCodes = new Set(files.filter((fileItem) => fileItem.id !== item.id).map((fileItem) => fileItem.unitCode).filter(Boolean));
                const availableUnits = scopedUnits.filter(
                  (unit) =>
                    unit.code === item.unitCode ||
                    (!takenUnitCodes.has(unit.code) && (canOverwriteDirectly || !unitCodesWithStoredData.has(unit.code))),
                );
                const suggestions = item.unitQuery.trim()
                  ? availableUnits.filter((unit) => {
                      const keyword = item.unitQuery.trim().toLowerCase();
                      return unit.name.toLowerCase().includes(keyword) || unit.code.toLowerCase().includes(keyword);
                    })
                  : availableUnits.slice(0, 12);

                return (
                  <div
                    key={item.id}
                    className={`rounded-[24px] border p-4 ${
                      validation?.status === 'invalid'
                        ? 'border-red-200 bg-red-50/50'
                        : item.matchStatus === 'NEEDS_CONFIRMATION' || item.matchStatus === 'UNMATCHED' || item.matchStatus === 'CONFLICT'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-[var(--line)] bg-[var(--surface-soft)]'
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[var(--ink)]">{item.file.name}</p>
                        <p className="page-subtitle mt-1 text-sm">
                          {(item.file.size / 1024).toFixed(1)} KB{item.relativePath ? ` - ${item.relativePath}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMatchBadgeTone(item)}`}>
                          {getMatchBadgeLabel(item)}
                        </span>
                        {canOverwriteDirectly && item.matchStatus === 'CONFLICT' && (
                          <button
                            type="button"
                            onClick={() => toggleOverwriteApproval(item.id)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                              overwriteApprovedIds[item.id]
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300'
                            }`}
                          >
                            {overwriteApprovedIds[item.id] ? '?? cho ph?p ghi ??' : 'Cho ph?p ghi ??'}
                          </button>
                        )}
                        {validation?.status === 'valid' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={12} />
                            File h?p l?
                          </span>
                        )}
                        <button
                          onClick={() => removeFile(item.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                        >
                          <X size={14} />
                          B? file
                        </button>
                      </div>
                    </div>
                    {isUnitUser ? (
                      <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">??n v? n?p d? li?u</p>
                        <p className="mt-2 text-base font-semibold text-[var(--ink)]">{item.unitQuery || currentUser?.unitName || currentUser?.unitCode || "Ch?a x?c ??nh"}</p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">H? th?ng t? g?n ??n v? theo t?i kho?n ??ng nh?p, kh?ng c?n ch?n l?i.</p>
                      </div>
                    ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <input
                          value={item.unitQuery}
                          onChange={(event) => updateUnitInput(item.id, event.target.value)}
                          list={`unit-suggestions-${item.id}`}
                          className="field-input h-11 text-base font-medium"
                          placeholder="G? t?n ??n v? ?? g?i ?"
                        />
                        <datalist id={`unit-suggestions-${item.id}`}>
                          {suggestions.map((unit) => (
                            <option key={unit.code} value={unit.name}>
                              {unit.code}
                            </option>
                          ))}
                        </datalist>
                      </div>

                      <select value={item.unitCode} onChange={(event) => updateUnit(item.id, event.target.value)} className="field-input h-11 text-base font-medium">
                        <option value="">-- Ho?c ch?n nhanh ??n v? --</option>
                        {availableUnits.map((unit) => (
                          <option key={unit.code} value={unit.code}>
                            {unit.name} ({unit.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    )}

                    <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 text-sm">
                      <p className="font-semibold text-[var(--ink)]">{item.matchReason}</p>
                      {item.suggestedUnitCode && (
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          G?i ?: {item.suggestedUnitName} ({item.suggestedUnitCode})
                        </p>
                      )}
                      {validation?.status === 'valid' && (
                        <p className="mt-2 text-xs text-emerald-700">
                          File h?p l?. ?? nh?n ?? c?c sheet b?t bu?c: {validation.matchedSheets.join(', ')}
                        </p>
                      )}
                      {validation?.status === 'invalid' && (
                        <>
                          {validation.missingSheets.length > 0 && (
                            <p className="mt-2 text-xs text-red-700">Thi?u sheet: {validation.missingSheets.join(', ')}</p>
                          )}
                          {validation.reason && <p className="mt-2 text-xs text-red-700">{validation.reason}</p>}
                        </>
                      )}
                      {(!validation || validation.status === 'pending') && (
                        <p className="mt-2 text-xs text-[var(--ink-soft)]">?ang ki?m tra c?u tr?c file...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {operationProgress?.visible && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(33,25,17,0.35)] px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_30px_90px_rgba(38,31,18,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">Ti?n ?? x? l?</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">{operationProgress.title}</h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{operationProgress.description}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-full ${operationProgress.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--surface-soft)] text-[var(--brand)]'}`}>
                {operationProgress.status === 'done' ? <CheckCircle2 size={22} /> : <LoaderCircle size={22} className="animate-spin" />}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm font-semibold text-[var(--ink)]">
                  <span>Ho?n th?nh</span>
                <span>{operationProgress.percent}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${operationProgress.status === 'done' ? 'bg-emerald-500' : 'bg-[var(--brand)]'}`}
                  style={{ width: `${operationProgress.percent}%` }}
                />
              </div>
            </div>

            {operationProgress.status === 'done' && (
              <div className="mt-6 flex justify-end">
                <button type="button" onClick={closeProgress} className="primary-btn">
                  ?? hi?u
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {importResultSummary?.visible && (
        <div className="fixed inset-0 z-[81] flex items-center justify-center bg-[rgba(33,25,17,0.42)] px-4 py-6">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-[0_30px_90px_rgba(38,31,18,0.24)]">
            <div className="border-b border-[var(--line)] bg-[var(--surface-soft)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-soft)]">K?t qu? ti?p nh?n</p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">T?ng h?p file ?? ho?n t?t</h3>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    ?? c?p nh?t {importResultSummary.updatedCount}/{importResultSummary.totalSelected} ??n v? ???c ch?n.
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={22} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">?? c?p nh?t</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-800">{importResultSummary.updatedCount}</p>
                </div>
                <div className="rounded-[18px] border border-[var(--line)] bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-soft)]">?? ch?n</p>
                  <p className="mt-2 text-2xl font-bold text-[var(--ink)]">{importResultSummary.totalSelected}</p>
                </div>
                <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Kh?ng c?p nh?t ???c</p>
                  <p className="mt-2 text-2xl font-bold text-amber-800">{importResultSummary.failedFiles.length}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-auto px-6 py-5">
              {importResultSummary.failedFiles.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">Danh s?ch ??n v? kh?ng c?p nh?t ???c</h4>
                  <div className="mt-3 space-y-3">
                    {importResultSummary.failedFiles.map((item, index) => (
                      <div key={`${item.fileName}-${item.relativePath || ''}-${index}`} className="rounded-[20px] border border-amber-200 bg-amber-50/50 px-4 py-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)]">{item.unitName}</p>
                            <p className="mt-1 break-all text-xs text-[var(--ink-soft)]">{item.fileName}</p>
                            {item.relativePath && <p className="mt-1 break-all text-[11px] text-[var(--ink-soft)]">{item.relativePath}</p>}
                          </div>
                          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                            Kh?ng c?p nh?t
                          </div>
                        </div>
                        {item.missingSheets.length > 0 && (
                          <p className="mt-3 text-xs font-medium text-amber-800">
                            Thi?u sheet: {item.missingSheets.join(", ")}
                          </p>
                        )}
                        {item.reason && (
                          <p className="mt-2 text-xs text-amber-900">
                            L? do: {item.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm font-medium text-emerald-800">
                  T?t c? c?c ??n v? ?? ch?n ??u ?? ???c c?p nh?t th?nh c?ng.
                </div>
              )}

              {importResultSummary.partialWarnings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">C?c ??n v? ti?p nh?n m?t ph?n</h4>
                  <div className="mt-3 space-y-3">
                    {importResultSummary.partialWarnings.map((warning, index) => (
                      <div key={`partial-warning-${index}`} className="rounded-[20px] border border-blue-200 bg-blue-50/60 px-4 py-4 text-sm text-blue-900">
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[var(--line)] px-6 py-4">
              <button type="button" onClick={closeImportResultSummary} className="primary-btn">
                ?? hi?u
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
