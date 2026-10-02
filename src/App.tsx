/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';

// --- CONFIGURATION ---
const TRACKING_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzEGMSwN707x3i3Rl9gD5P_HoIRwuj59AzVftd3e_pT3_I1W1iz0jL-Gsfku-WYUwm-/exec'; 
const VALIDATION_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzEGMSwN707x3i3Rl9gD5P_HoIRwuj59AzVftd3e_pT3_I1W1iz0jL-Gsfku-WYUwm-/exec'; 
const LAST_EDITED_DATE = '06/03/2025';

// --- DATA & TYPES ---
type FormState = {
    selectedDiseases: Set<string>;
    isOnDOAC: boolean;
    isOnLithium: boolean;
    isOnAntipsychotics: boolean;
    isOnMetformin: boolean;
    ckdStage: '3a' | '3b' | '4' | '5';
};

type Question = {
    key: keyof Omit<FormState, 'selectedDiseases'>;
    label: string;
    type: 'toggle' | 'select';
    options?: { value: string; label: string }[];
};

type Disease = {
    name: string;
    colorClass: string;
    questions?: Question[];
};

type CalculatedTest = {
    testName: string;
    frequencies: { frequency: string; diseases: string[] }[];
};

const diseases: Disease[] = [
    { name: "Atrial Fibrillation", colorClass: "icon-red", questions: [{ key: 'isOnDOAC', label: 'Is the patient on a DOAC?', type: 'toggle' }] },
    { name: "Cardiovascular Disease", colorClass: "icon-pink" },
    { name: "Chronic Kidney Disease", colorClass: "icon-purple", questions: [{ key: 'ckdStage', label: 'CKD Stage:', type: 'select', options: [{ value: '3a', label: 'CKD 3a (GFR: 45-59)' }, { value: '3b', label: 'CKD 3b (GFR: 30-44)' }, { value: '4', label: 'CKD 4 (GFR: 15-29)' }, { value: '5', label: 'CKD 5 (GFR: <15)' }] }] },
    { name: "Coronary Heart Disease", colorClass: "icon-red" },
    { name: "Diabetes Mellitus", colorClass: "icon-orange", questions: [{ key: 'isOnMetformin', label: 'Is the patient on Metformin?', type: 'toggle' }] },
    { name: "Heart Failure", colorClass: "icon-pink" },
    { name: "Hypertension", colorClass: "icon-red" },
    { name: "Hypothyroidism", colorClass: "icon-teal" },
    { name: "Learning Disability", colorClass: "icon-blue" },
    { name: "Mental Health", colorClass: "icon-blue", questions: [
        { key: 'isOnLithium', label: 'Is the patient on Lithium?', type: 'toggle' },
        { key: 'isOnAntipsychotics', label: 'Is the patient on Antipsychotics?', type: 'toggle' }
    ] },
    { name: "NHS Health Check", colorClass: "icon-green" },
    { name: "Non-Diabetic Hyperglycaemia", colorClass: "icon-orange" },
    { name: "Stroke/TIA", colorClass: "icon-purple" },
    { name: "B12 Anemia", colorClass: "icon-yellow" },
];

const bloodTests: Record<string, Record<string, any>> = {
    "FBC": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Diabetes Mellitus": "Annually", "Chronic Kidney Disease": "Annually", "B12 Anemia": "10 days after starting treatment" },
    "U&Es": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Hypertension": "Annually", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "3 monthly", falseFrequency: "Annually" }, "Chronic Kidney Disease": "Frequency based on CKD stage", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "LFTs": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": "Annually", "NHS Health Check": "5 yearly (40-74 years)" },
    "HbA1c": { "Atrial Fibrillation": "At diagnosis & every 3 years", "Coronary Heart Disease": "At diagnosis & every 3 years", "Heart Failure": "At diagnosis & every 3 years", "Hypertension": "At diagnosis & every 3 years", "Stroke/TIA": "Annually", "Diabetes Mellitus": "6 monthly", "Mental Health": "Annually", "Chronic Kidney Disease": "At diagnosis & every 3 years", "Non-Diabetic Hyperglycaemia": "Annually", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "TFTs": { "Atrial Fibrillation": "At diagnosis", "Diabetes Mellitus": "At diagnosis & every 3 years", "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "6 monthly", falseFrequency: "Annually" }, "Hypothyroidism": "Annually if stable. After 3 months if dose changed" },
    "LIPIDS": { "Coronary Heart Disease": "Annually", "Heart Failure": "Annually (if on statin)", "Hypertension": "Following diagnosis to check CVD risk", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": "Annually", "Chronic Kidney Disease": "Annually", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "LITHIUM": { "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "3 monthly", falseFrequency: null } },
    "CALCIUM": { "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "6 monthly", falseFrequency: null }, "Chronic Kidney Disease": "Frequency based on CKD stage" },
    "BNP": { "Heart Failure": "Once to make diagnosis. NO MONITORING" },
    "B12": { "Diabetes Mellitus": { conditionKey: "isOnMetformin", trueFrequency: "Annually", falseFrequency: null }, "B12 Anemia": "To make diagnosis & 1-2 months after treatment. NO MONITORING" },
    "URINE (ACR)": { "Diabetes Mellitus": "Annually", "Chronic Kidney Disease": "Annually" },
    "PROLACTIN": { "Mental Health": { conditionKey: "isOnAntipsychotics", trueFrequency: "Annually", falseFrequency: null } }
};

const isMonitoringFrequency = (freq: string): boolean => {
    const lowerFreq = freq.toLowerCase().trim();
    const exclusions = ["diagnosis", "to check cvd risk", "make diagnosis", "no monitoring", "after starting treatment"];
    if (lowerFreq.includes("diagnosis") && lowerFreq.includes("every")) return true;
    for (const term of exclusions) { if (lowerFreq.includes(term)) return false; }
    return true;
};

const getCKDFrequency = (stage: string, test: string) => {
    if (test === "U&Es") {
        switch (stage) {
            case "3a": return "Annually";
            case "3b": return "6 monthly";
            case "4": return "Every 4-6 months";
            case "5": return "3 monthly";
            default: return null;
        }
    }
    if (test === "CALCIUM") {
        switch (stage) {
            case "3a": return null;
            case "3b": return "6 monthly";
            case "4": return "3 monthly";
            case "5": return "Monthly";
            default: return null;
        }
    }
    return undefined;
};

const getFrequencyColor = (freq: string): string => {
    const f = freq.toLowerCase();
    if (f.includes('3 monthly')) return 'tag-red';
    if (f.includes('6 monthly')) return 'tag-orange';
    if (f.includes('4-6 months')) return 'tag-pink';
    if (f.includes('monthly')) return 'tag-yellow';
    if (f.includes('annually')) return 'tag-blue';
    if (f.includes('5 yearly')) return 'tag-green';
    if (f.includes('every 3 years')) return 'tag-teal';
    if (f.includes('10 days') || f.includes('1-2 months')) return 'tag-indigo';
    if (f.includes('diagnosis')) return 'tag-purple';
    return 'tag-gray';
};

const calculateRequiredTests = (formState: FormState): CalculatedTest[] => {
    const requiredTestsData: Record<string, { frequencies: Record<string, Set<string>> }> = {};
    const selectedDiseases = Array.from(formState.selectedDiseases);

    for (const [testName, conditionsForTest] of Object.entries(bloodTests)) {
        selectedDiseases.forEach(disease => {
            if (conditionsForTest.hasOwnProperty(disease)) {
                let rawEntry = conditionsForTest[disease];
                let freq: string | null = null;

                if (typeof rawEntry === 'string') {
                    freq = rawEntry;
                } else if (rawEntry && rawEntry.conditionKey) {
                    const met = formState[rawEntry.conditionKey as keyof FormState];
                    freq = met ? rawEntry.trueFrequency : rawEntry.falseFrequency;
                }
                
                if (disease === "Chronic Kidney Disease") {
                     const ckdFreq = getCKDFrequency(formState.ckdStage, testName);
                     if (ckdFreq !== undefined) freq = ckdFreq;
                }

                if (freq && freq !== "Frequency based on CKD stage") {
                    if (!requiredTestsData[testName]) requiredTestsData[testName] = { frequencies: {} };
                    if (!requiredTestsData[testName].frequencies[freq]) requiredTestsData[testName].frequencies[freq] = new Set();
                    requiredTestsData[testName].frequencies[freq].add(disease);
                }
            }
        });
    }

    const calculated = Object.entries(requiredTestsData).map(([testName, data]) => ({
        testName,
        frequencies: Object.entries(data.frequencies).map(([frequency, diseasesSet]) => ({
            frequency,
            diseases: Array.from(diseasesSet),
        })),
    }));
    
    const desiredOrder = ["U&Es", "LFTs", "CALCIUM", "LIPIDS", "TFTs", "B12", "URINE (ACR)", "FBC", "HbA1c", "LITHIUM", "BNP", "PROLACTIN"];
    return calculated.sort((a, b) => desiredOrder.indexOf(a.testName) - desiredOrder.indexOf(b.testName));
};

const medicalCrossIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="headerStarGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#FF8E8E;stop-opacity:1" /><stop offset="50%" style="stop-color:#FF453A;stop-opacity:1" /><stop offset="100%" style="stop-color:#C32E2E;stop-opacity:1" /></linearGradient></defs><path fill="url(#headerStarGrad)" d="M12 0L14.6 9.4L24 12L14.6 14.6L12 24L9.4 14.6L0 12L9.4 9.4L12 0Z"/></svg>`;
const exclamationIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>`;
const exclamationIconRed = `<svg viewBox="0 0 24 24" fill="#FF453A"><path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>`;
const animatedPlaceholderIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 5.5C15.5 4.39705 14.6029 3.5 13.5 3.5H10.5C9.39705 3.5 8.5 4.39705 8.5 5.5V11.5H5.5C4.39705 11.5 3.5 12.3971 3.5 13.5V18.5C3.5 20.1569 4.84315 21.5 6.5 21.5H17.5C19.1569 21.5 20.5 20.1569 20.5 18.5V13.5C20.5 12.3971 18.5 11.5 18.5 11.5H15.5V5.5ZM13.5 5.5H10.5V11.5H13.5V5.5ZM18.5 13.5V18.5C18.5 19.0523 18.0523 19.5 17.5 19.5H6.5C5.94772 19.5 5.5 19.0523 5.5 18.5V13.5H18.5Z"/></svg>`;
const sparkleIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.4 10.6 L22 12 L13.4 13.4 L12 22 L10.6 13.4 L2 12 L10.6 10.6 Z"/></svg>`;
const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
const verifiedIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const dropIconRed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF453A" width="14" height="14"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;
const activityIconRed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FF453A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polyline class="ecg-line" points="0 12 2 12 4 10 6 12 8 12 9 4 11 20 13 12 15 12 17 10 19 12 24 12"/></svg>`;
const heartIconRed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF453A" width="14" height="14"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
const flaskIconRed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FF453A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M9 2v8H7.22c-.4 0-.77.23-.94.58l-3 6c-.34.68.14 1.42.9 1.42h15.64c.76 0 1.24-.74.9-1.42l-3-6c-.17-.35-.54-.58-.94-.58H15V2"/><path d="M9 2h6"/><path d="M12 11v4"/><path d="M8 15h8"/></svg>`;

const getTestIcon = (testName: string) => {
    return activityIconRed;
};

const CustomSelect = ({ value, options, onChange }: { value: string, options: { value: string, label: string }[], onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className="custom-select-container" ref={containerRef}>
            <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                <span>{selectedOption ? selectedOption.label : 'Select...'}</span>
                <span className={`arrow ${isOpen ? 'open' : ''}`}>▼</span>
            </div>
            {isOpen && (
                <div className="custom-select-dropdown">
                    {options.map(opt => (
                        <div 
                            key={opt.value} 
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => { onChange(opt.value); setIsOpen(false); }}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const logUserLogin = async (username: string) => {
    const timestamp = new Date().toISOString();
    const payload = {
        action: 'login',
        event: 'user_login',
        username: username,
        timestamp: timestamp,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
    };

    const userKey = `hgp_logins_${username.toLowerCase()}`;
    const totalKey = `hgp_total_logins_count`;
    const userCount = (parseInt(localStorage.getItem(userKey) || '0', 10)) + 1;
    const totalCount = (parseInt(localStorage.getItem(totalKey) || '0', 10)) + 1;

    localStorage.setItem(userKey, userCount.toString());
    localStorage.setItem(totalKey, totalCount.toString());

    let result = {
        valid: true,
        userLoginCount: userCount,
        totalLogins: totalCount
    };

    // 1. Post to local Express server database
    try {
        const localRes = await fetch('/api/logins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, userAgent: payload.userAgent })
        });
        if (localRes.ok) {
            const localData = await localRes.json();
            if (localData.userLoginCount) result.userLoginCount = localData.userLoginCount;
            if (localData.totalLogins) result.totalLogins = localData.totalLogins;
        }
    } catch {
        // Fallback to local storage or webhook response
    }

    // 2. Post to Google Sheets webhook if configured
    if (VALIDATION_WEBHOOK_URL) {
        try {
            const res = await fetch(VALIDATION_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            try {
                const data = await res.json();
                if (data) {
                    if (data.valid === false) result.valid = false;
                    if (data.loginCount || data.userLoginCount) {
                        result.userLoginCount = Number(data.loginCount || data.userLoginCount);
                    }
                    if (data.totalLogins) {
                        result.totalLogins = Number(data.totalLogins);
                    }
                }
            } catch {
                // If endpoint returns plain text or redirects
            }
        } catch (err) {
            console.warn("Spreadsheet webhook notice:", err);
        }
    }

    return result;
};

const APPS_SCRIPT_CODE = `/**
 * Google Apps Script for HGP Blood Test Allocator
 * Logs each login, calculates individual & overall login counts, and tracks condition searches.
 */

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    var data = {};
    if (contents) {
      try { data = JSON.parse(contents); } catch (err) { data = { raw: contents }; }
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = data.action || (data.conditions ? "track_conditions" : "login");
    var username = data.username || data.user || "Anonymous";
    var timestamp = data.timestamp || new Date().toISOString();
    
    if (action === "login" || action === "user_login") {
      var logSheet = getOrCreateSheet(ss, "Login Logs", ["Timestamp", "Username", "Action", "User Login Count", "Total App Logins", "User Agent"]);
      var summarySheet = getOrCreateSheet(ss, "User Summary", ["Username", "Total Logins", "Last Login"]);
      
      var userLoginCount = updateUserSummary(summarySheet, username, timestamp);
      var totalAppLogins = Math.max(1, logSheet.getLastRow()); // Row 1 is header
      
      logSheet.appendRow([new Date(), username, "LOGIN", userLoginCount, totalAppLogins, data.userAgent || "Web App"]);
      
      return createJsonResponse({
        valid: true,
        message: "Login logged successfully",
        username: username,
        loginCount: userLoginCount,
        totalLogins: totalAppLogins
      });
    } else if (action === "track_conditions" || data.conditions) {
      var trackSheet = getOrCreateSheet(ss, "Condition Tracking", ["Timestamp", "Username", "Conditions Selected"]);
      var conditionsStr = Array.isArray(data.conditions) ? data.conditions.join(", ") : (data.conditions || "");
      trackSheet.appendRow([new Date(), username, conditionsStr]);
      
      return createJsonResponse({ valid: true, message: "Conditions logged successfully" });
    }
    
    return createJsonResponse({ valid: true, message: "Action recorded" });
  } catch (error) {
    return createJsonResponse({ valid: false, error: error.toString() });
  }
}

function doGet(e) {
  return createJsonResponse({ status: "Active", message: "HGP Webhook Endpoint Active" });
}

function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#005EB8").setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function updateUserSummary(sheet, username, timestamp) {
  var data = sheet.getDataRange().getValues();
  var userRowIndex = -1;
  var userCount = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === username.toLowerCase()) {
      userRowIndex = i + 1;
      userCount = Number(data[i][1]) || 0;
      break;
    }
  }
  userCount += 1;
  if (userRowIndex > 0) {
    sheet.getRange(userRowIndex, 2).setValue(userCount);
    sheet.getRange(userRowIndex, 3).setValue(new Date());
  } else {
    sheet.appendRow([username, userCount, new Date()]);
  }
  return userCount;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}`;

const AdminModalBuilder = ({ isOpen, onClose, currentUsername, initialTab = 'broadcast', onLogout }: { isOpen: boolean, onClose: () => void, currentUsername: string, initialTab?: 'broadcast' | 'governance', onLogout?: () => void }) => {
    const [adminTab, setAdminTab] = useState<'broadcast' | 'governance'>(initialTab);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [badgeType, setBadgeType] = useState<'info' | 'urgent' | 'update'>('info');
    const [isActive, setIsActive] = useState(true);
    const [govText, setGovText] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
    const wysiwygRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setAdminTab(initialTab);
            fetch('/api/announcement')
                .then(res => res.json())
                .then(data => {
                    if (data.active && data.announcement) {
                        setTitle(data.announcement.title || '');
                        setMessage(data.announcement.message || '');
                        setBadgeType(data.announcement.badgeType || 'info');
                        setIsActive(true);
                    }
                })
                .catch(() => {});

            fetch('/api/governance')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.content) {
                        setGovText(data.content);
                        if (wysiwygRef.current) {
                            wysiwygRef.current.innerHTML = data.content;
                        }
                    }
                })
                .catch(() => {});
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (editorMode === 'visual' && wysiwygRef.current) {
            // Only populate innerHTML if it's currently empty or different AND not focused
            if (wysiwygRef.current.innerHTML !== govText && document.activeElement !== wysiwygRef.current) {
                wysiwygRef.current.innerHTML = govText;
            }
        }
    }, [editorMode]);

    if (!isOpen) return null;

    const handleSaveBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg(null);

        try {
            const res = await fetch('/api/announcement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUsername,
                    title,
                    message,
                    badgeType,
                    isActive
                })
            });
            const data = await res.json();
            if (res.ok) {
                setStatusMsg('✓ Broadcast successfully published to all staff!');
                setTimeout(() => {
                    setStatusMsg(null);
                    onClose();
                }, 1500);
            } else {
                setStatusMsg(`Error: ${data.error || 'Failed to save'}`);
            }
        } catch {
            setStatusMsg('Error: Could not reach server');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveGovernance = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMsg(null);

        try {
            const res = await fetch('/api/governance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: currentUsername,
                    content: govText
                })
            });
            const data = await res.json();
            if (res.ok) {
                setStatusMsg('✓ Clinical Governance text updated in backend!');
                setTimeout(() => {
                    setStatusMsg(null);
                    onClose();
                }, 1500);
            } else {
                setStatusMsg(`Error: ${data.error || 'Failed to save governance'}`);
            }
        } catch {
            setStatusMsg('Error: Could not reach server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px', border: '1px solid rgba(100, 210, 255, 0.3)' }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>👑</span>
                        <div>
                            <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: '700', color: '#64D2FF' }}>
                                Admin Master Panel
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: 'var(--ios-dark-gray)' }}>Master Control Account: cjw</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {onLogout && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onLogout();
                                }}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.72rem',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 69, 58, 0.15)',
                                    color: 'var(--ios-red)',
                                    border: '1px solid var(--ios-red)',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                🚪 Sign Out Admin
                            </button>
                        )}
                        <button className="close-btn" onClick={onClose}>&times;</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', padding: '0 20px', marginTop: '12px', borderBottom: '1px solid var(--ios-separator)' }}>
                    <button 
                        onClick={() => setAdminTab('broadcast')}
                        style={{
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: '600',
                            border: 'none',
                            borderBottom: adminTab === 'broadcast' ? '2px solid #64D2FF' : '2px solid transparent',
                            background: 'transparent',
                            color: adminTab === 'broadcast' ? '#64D2FF' : 'var(--ios-dark-gray)',
                            cursor: 'pointer'
                        }}
                    >
                        📢 Popup Broadcast Builder
                    </button>
                    <button 
                        onClick={() => setAdminTab('governance')}
                        style={{
                            padding: '8px 14px',
                            fontSize: '0.82rem',
                            fontWeight: '600',
                            border: 'none',
                            borderBottom: adminTab === 'governance' ? '2px solid #64D2FF' : '2px solid transparent',
                            background: 'transparent',
                            color: adminTab === 'governance' ? '#64D2FF' : 'var(--ios-dark-gray)',
                            cursor: 'pointer'
                        }}
                    >
                        📝 Edit Clinical Governance Text
                    </button>
                </div>

                {adminTab === 'broadcast' ? (
                    <form onSubmit={handleSaveBroadcast} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', padding: '10px 14px', borderRadius: '10px' }}>
                            <div>
                                <strong style={{ fontSize: '0.85rem', display: 'block' }}>Broadcast Active</strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--ios-label-secondary)' }}>Show popup on staff login</span>
                            </div>
                            <label className="toggle-switch">
                                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                                <span className="slider"></span>
                            </label>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--ios-label-secondary)', marginBottom: '4px', display: 'block' }}>Badge Style</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {[
                                    { id: 'info', label: 'ℹ️ Notice', color: 'var(--ios-blue)' },
                                    { id: 'urgent', label: '⚠️ Urgent Alert', color: 'var(--ios-red)' },
                                    { id: 'update', label: '📢 Pathway Update', color: 'var(--ios-green)' }
                                ].map(b => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => setBadgeType(b.id as any)}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            fontSize: '0.75rem',
                                            borderRadius: '8px',
                                            border: badgeType === b.id ? `2px solid ${b.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                                            background: badgeType === b.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            color: '#FFF',
                                            cursor: 'pointer',
                                            fontWeight: badgeType === b.id ? '700' : '400'
                                        }}
                                    >
                                        {b.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--ios-label-secondary)', marginBottom: '4px', display: 'block' }}>Modal Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Clinical Update: Renal Monitoring Protocols"
                                required={isActive}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid var(--ios-separator)',
                                    color: '#FFF',
                                    fontSize: '0.88rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--ios-label-secondary)', marginBottom: '4px', display: 'block' }}>Message Body</label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Type practice broadcast message for all staff here..."
                                rows={4}
                                required={isActive}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid var(--ios-separator)',
                                    color: '#FFF',
                                    fontSize: '0.85rem',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        {statusMsg && (
                            <div style={{
                                padding: '10px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                textAlign: 'center',
                                background: statusMsg.startsWith('✓') ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 69, 58, 0.15)',
                                color: statusMsg.startsWith('✓') ? 'var(--ios-green)' : 'var(--ios-red)'
                            }}>
                                {statusMsg}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: 'transparent',
                                    border: '1px solid var(--ios-separator)',
                                    color: 'var(--ios-label-secondary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    flex: 2,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: 'var(--ios-blue)',
                                    border: 'none',
                                    color: '#FFF',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                {loading ? 'Publishing...' : '📢 Save & Broadcast Modal'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleSaveGovernance} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--ios-label-secondary)' }}>
                                    Clinical Governance Content
                                </label>
                                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '2px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditorMode('visual');
                                            setTimeout(() => {
                                                if (wysiwygRef.current) {
                                                    wysiwygRef.current.innerHTML = govText;
                                                }
                                            }, 0);
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.72rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: editorMode === 'visual' ? 'var(--ios-blue)' : 'transparent',
                                            color: editorMode === 'visual' ? '#FFF' : 'var(--ios-dark-gray)',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        👁️ Visual (WYSIWYG)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditorMode('code');
                                        }}
                                        style={{
                                            padding: '4px 10px',
                                            fontSize: '0.72rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: editorMode === 'code' ? 'var(--ios-blue)' : 'transparent',
                                            color: editorMode === 'code' ? '#FFF' : 'var(--ios-dark-gray)',
                                            fontWeight: '600',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        💻 Code (HTML)
                                    </button>
                                </div>
                            </div>

                            {editorMode === 'visual' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {/* Visual WYSIWYG Formatting Toolbar */}
                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px',
                                        padding: '8px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--ios-separator)'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => document.execCommand('bold', false)}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            title="Bold"
                                        >
                                            B
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => document.execCommand('italic', false)}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', fontStyle: 'italic', background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            title="Italic"
                                        >
                                            I
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => document.execCommand('underline', false)}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', textDecoration: 'underline', background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            title="Underline"
                                        >
                                            U
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => document.execCommand('formatBlock', false, 'h4')}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: '700', color: '#64D2FF', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            title="Section Heading"
                                        >
                                            H4 Section
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const boxHtml = `<div style="background: rgba(255, 69, 58, 0.1); padding: 10px; border-radius: 8px; border-left: 3px solid var(--ios-red); margin: 8px 0;"><strong style="color: var(--ios-red); font-size: 0.82rem; display: block;">⚠️ IMPORTANT CLINICAL NOTICE</strong><span style="font-size: 0.8rem;">Type clinical alert details here...</span></div>`;
                                                document.execCommand('insertHTML', false, boxHtml);
                                            }}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(255, 69, 58, 0.2)', color: 'var(--ios-red)', border: '1px solid var(--ios-red)', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                                            title="Insert Red Alert Box"
                                        >
                                            + ⚠️ Alert Box
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const boxHtml = `<div style="background: rgba(10, 132, 255, 0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--ios-blue); margin: 8px 0;"><strong style="color: #64D2FF; font-size: 0.82rem; display: block;">ℹ️ PROTOCOL NOTE</strong><span style="font-size: 0.8rem;">Type protocol instructions here...</span></div>`;
                                                document.execCommand('insertHTML', false, boxHtml);
                                            }}
                                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(10, 132, 255, 0.2)', color: '#64D2FF', border: '1px solid var(--ios-blue)', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                                            title="Insert Protocol Box"
                                        >
                                            + ℹ️ Protocol Box
                                        </button>
                                    </div>

                                    {/* Visual Editable Canvas */}
                                    <div
                                        contentEditable
                                        suppressContentEditableWarning
                                        ref={wysiwygRef}
                                        onInput={() => {
                                            if (wysiwygRef.current) {
                                                setGovText(wysiwygRef.current.innerHTML);
                                            }
                                        }}
                                        onBlur={() => {
                                            if (wysiwygRef.current) {
                                                setGovText(wysiwygRef.current.innerHTML);
                                            }
                                        }}
                                        style={{
                                            minHeight: '220px',
                                            maxHeight: '340px',
                                            overflowY: 'auto',
                                            padding: '14px',
                                            borderRadius: '8px',
                                            background: '#151518',
                                            border: '1.5px solid var(--ios-blue)',
                                            color: '#FFF',
                                            fontSize: '0.85rem',
                                            lineHeight: '1.5',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            ) : (
                                <textarea
                                    value={govText}
                                    onChange={e => setGovText(e.target.value)}
                                    rows={12}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        background: 'rgba(255, 255, 255, 0.08)',
                                        border: '1px solid var(--ios-separator)',
                                        color: '#FFF',
                                        fontSize: '0.82rem',
                                        fontFamily: 'monospace',
                                        lineHeight: '1.4',
                                        resize: 'vertical'
                                    }}
                                />
                            )}
                        </div>

                        {statusMsg && (
                            <div style={{
                                padding: '10px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                textAlign: 'center',
                                background: statusMsg.startsWith('✓') ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 69, 58, 0.15)',
                                color: statusMsg.startsWith('✓') ? 'var(--ios-green)' : 'var(--ios-red)'
                            }}>
                                {statusMsg}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: 'transparent',
                                    border: '1px solid var(--ios-separator)',
                                    color: 'var(--ios-label-secondary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    flex: 2,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: 'var(--ios-blue)',
                                    border: 'none',
                                    color: '#FFF',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                {loading ? 'Saving...' : '💾 Save Governance Text'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

const AnnouncementModal = ({ announcement, username, onClose }: { announcement: { id: number; title: string; message: string; badgeType: string }, username: string, onClose: () => void }) => {
    const [closing, setClosing] = useState(false);

    const handleAck = () => {
        setClosing(true);
        setTimeout(() => {
            sessionStorage.setItem(`hgp_ack_announcement_${announcement.id}`, 'true');
            fetch('/api/announcement/ack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, announcementId: announcement.id })
            }).catch(() => {});
            onClose();
        }, 300);
    };

    const getBadgeStyle = () => {
        switch (announcement.badgeType) {
            case 'urgent': return { bg: 'rgba(255, 69, 58, 0.15)', text: 'var(--ios-red)', border: 'var(--ios-red)', icon: '⚠️', label: 'URGENT CLINICAL ALERT' };
            case 'update': return { bg: 'rgba(48, 209, 88, 0.15)', text: 'var(--ios-green)', border: 'var(--ios-green)', icon: '📢', label: 'PRACTICE PATHWAY UPDATE' };
            default: return { bg: 'rgba(100, 210, 255, 0.15)', text: '#64D2FF', border: 'var(--ios-blue)', icon: 'ℹ️', label: 'PRACTICE NOTICE' };
        }
    };

    const badge = getBadgeStyle();

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '60px',
            paddingLeft: '16px',
            paddingRight: '16px',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: closing ? 0 : 1
        }}>
            <div style={{
                background: '#1C1C1E',
                width: '100%',
                maxWidth: '500px',
                borderRadius: '18px',
                border: `1.5px solid ${badge.border}`,
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                overflow: 'hidden',
                animation: closing ? 'none' : 'slideDownIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}>
                <style>{`
                    @keyframes slideDownIn {
                        from { transform: translateY(-40px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}</style>
                <div style={{
                    padding: '16px 20px',
                    background: badge.bg,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span style={{ fontSize: '1.4rem' }}>{badge.icon}</span>
                    <div>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', letterSpacing: '0.5px', color: badge.text, display: 'block' }}>
                            {badge.label}
                        </span>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: '700', color: '#FFF' }}>
                            {announcement.title}
                        </h2>
                    </div>
                </div>

                <div style={{ padding: '20px', color: 'var(--ios-label-primary)', fontSize: '0.9rem', lineHeight: '1.5', whitespace: 'pre-wrap' }}>
                    {announcement.message}
                </div>

                <div style={{
                    padding: '14px 20px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderTop: '1px solid var(--ios-separator)',
                    display: 'flex',
                    justify: 'flex-end'
                }}>
                    <button
                        onClick={handleAck}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            background: badge.border,
                            color: '#FFF',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            border: 'none',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        Acknowledge & Continue
                    </button>
                </div>
            </div>
        </div>
    );
};

const InfoModal = ({ isOpen, onClose, currentUsername, onOpenAdminGovernance }: { isOpen: boolean, onClose: () => void, currentUsername: string, onOpenAdminGovernance?: () => void }) => {
    const [activeTab, setActiveTab] = useState<'governance' | 'spreadsheet'>('governance');
    const [copied, setCopied] = useState(false);
    const [governanceHtml, setGovernanceHtml] = useState<string | null>(null);

    const isAdmin = currentUsername.trim().toLowerCase() === 'cjw';

    useEffect(() => {
        if (isOpen) {
            fetch('/api/governance')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.content) {
                        setGovernanceHtml(data.content);
                    }
                })
                .catch(() => {});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleCopyCode = () => {
        navigator.clipboard.writeText(APPS_SCRIPT_CODE);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
                <div className="modal-header">
                    <div style={{display: 'flex', alignItems: 'flex-start', gap: '8px'}}>
                        <span style={{fontSize: '1.1rem'}}>{activeTab === 'governance' ? '⚠️' : '📊'}</span>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                            <h3 style={{fontSize: '1rem', margin: 0, fontWeight: '600'}}>
                                {activeTab === 'governance' ? 'Clinical Validation & Governance' : 'Spreadsheet Backend & Apps Script'}
                            </h3>
                            <span style={{fontSize: '0.6rem', color: 'var(--ios-dark-gray)', marginTop: '2px'}}>Last edited by Christian Whitehead on {LAST_EDITED_DATE}</span>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginTop: '12px', borderBottom: '1px solid var(--ios-separator)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => setActiveTab('governance')}
                            style={{
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                border: 'none',
                                borderBottom: activeTab === 'governance' ? '2px solid var(--ios-blue)' : '2px solid transparent',
                                background: 'transparent',
                                color: activeTab === 'governance' ? 'var(--ios-blue)' : 'var(--ios-dark-gray)',
                                cursor: 'pointer'
                            }}
                        >
                            Clinical Governance
                        </button>
                        <button 
                            onClick={() => setActiveTab('spreadsheet')}
                            style={{
                                padding: '8px 14px',
                                fontSize: '0.82rem',
                                fontWeight: '600',
                                border: 'none',
                                borderBottom: activeTab === 'spreadsheet' ? '2px solid var(--ios-blue)' : '2px solid transparent',
                                background: 'transparent',
                                color: activeTab === 'spreadsheet' ? 'var(--ios-blue)' : 'var(--ios-dark-gray)',
                                cursor: 'pointer'
                            }}
                        >
                            Spreadsheet Logging Script
                        </button>
                    </div>

                    {isAdmin && activeTab === 'governance' && onOpenAdminGovernance && (
                        <button
                            onClick={() => {
                                onClose();
                                onOpenAdminGovernance();
                            }}
                            style={{
                                padding: '4px 10px',
                                fontSize: '0.72rem',
                                borderRadius: '8px',
                                background: 'rgba(255, 215, 0, 0.15)',
                                color: '#FFD700',
                                border: '1px solid #FFD700',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            ✏️ Edit Governance Text
                        </button>
                    )}
                </div>

                <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {activeTab === 'governance' ? (
                        governanceHtml ? (
                            <div dangerouslySetInnerHTML={{ __html: governanceHtml }} />
                        ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ios-dark-gray)' }}>Loading clinical governance...</div>
                        )
                    ) : (
                        <div>
                            <div style={{ background: 'rgba(48, 209, 88, 0.1)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid var(--ios-green)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong style={{ color: 'var(--ios-green)', fontSize: '0.85rem', display: 'block' }}>Spreadsheet & Backend Logging Active</strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--ios-label-secondary)' }}>
                                        Every user login is logged with timestamps, username, and cumulative login counts.
                                    </span>
                                </div>
                                <a 
                                    href="/api/logins/csv" 
                                    download="hgp_login_logs.csv"
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '0.75rem',
                                        borderRadius: '8px',
                                        background: 'var(--ios-green)',
                                        color: '#000',
                                        fontWeight: '700',
                                        textDecoration: 'none',
                                        whiteSpace: 'nowrap',
                                        marginLeft: '12px'
                                    }}
                                >
                                    📥 Download CSV
                                </a>
                            </div>

                            <div style={{ background: 'rgba(255, 159, 10, 0.1)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid var(--ios-orange)', marginBottom: '16px' }}>
                                <strong style={{ color: 'var(--ios-orange)', fontSize: '0.82rem', display: 'block', marginBottom: '4px' }}>
                                    ⚠️ Fixing Google Drive "Unable to open file at present" Error
                                </strong>
                                <span style={{ fontSize: '0.78rem', color: 'var(--ios-label-secondary)', lineHeight: '1.4', display: 'block' }}>
                                    If clicking <em>Extensions &gt; Apps Script</em> gives this Google Drive error, it is caused by having <strong>multiple Google accounts</strong> signed into your browser simultaneously.
                                </span>
                                <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#FFF' }}>
                                    <strong>Quick Fix (Choose one):</strong>
                                    <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                                        <li><strong>Option A:</strong> Open an <strong>Incognito Window</strong> (Ctrl+Shift+N or Cmd+Shift+N), log in with the account owning the sheet, then open <em>Extensions &gt; Apps Script</em>.</li>
                                        <li><strong>Option B:</strong> Go directly to <a href="https://script.google.com" target="_blank" rel="noreferrer" style={{ color: '#64D2FF' }}>script.google.com</a> and click <strong>New project</strong>.</li>
                                    </ul>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#64D2FF' }}>Google Apps Script Code (Code.gs)</strong>
                                <button 
                                    onClick={handleCopyCode}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.75rem',
                                        borderRadius: '6px',
                                        background: copied ? 'var(--ios-green)' : 'var(--ios-blue)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    {copied ? '✓ Copied!' : 'Copy Code'}
                                </button>
                            </div>

                            <pre style={{
                                background: '#111116',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--ios-separator)',
                                fontSize: '0.75rem',
                                color: '#A5DEFF',
                                overflowX: 'auto',
                                maxHeight: '200px'
                            }}>
                                {APPS_SCRIPT_CODE}
                            </pre>

                            <ol style={{ fontSize: '0.8rem', marginTop: '16px', paddingLeft: '20px', color: 'var(--ios-label-secondary)', lineHeight: '1.5' }}>
                                <li>In an Incognito window, open your Google Sheet and go to <strong>Extensions &gt; Apps Script</strong>.</li>
                                <li>Paste the script above into <code>Code.gs</code>.</li>
                                <li>Click <strong>Deploy &gt; New deployment</strong>, select <strong>Web App</strong>, set access to <em>"Anyone"</em>.</li>
                                <li>Every login automatically updates the <strong>Login Logs</strong> and <strong>User Summary</strong> sheets!</li>
                            </ol>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="button-reset" style={{width: '100%', padding: '12px', background: 'var(--ios-blue)', border: 'none'}} onClick={onClose}>Understood</button>
                </div>
            </div>
        </div>
    );
};

const LoginScreen = ({ onLogin }: { onLogin: (username: string, stats?: { userLoginCount: number; totalLogins: number }) => void }) => {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed) return;
        setLoading(true);
        try {
            const result = await logUserLogin(trimmed);
            if (result.valid) {
                onLogin(trimmed, { userLoginCount: result.userLoginCount, totalLogins: result.totalLogins });
            } else {
                onLogin('DENIED_USER');
            }
        } catch (err) {
            onLogin(trimmed);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-screen-wrapper">
            <div className="login-card">
                <div className="login-icon header-icon-glow" dangerouslySetInnerHTML={{ __html: medicalCrossIcon }} />
                <h2 style={{margin: '0 0 8px', fontSize: '1.3rem', fontWeight: '600'}}>Staff Entry</h2>
                <p style={{color: 'var(--ios-dark-gray)', fontSize: '0.85rem', marginBottom: '28px', fontWeight: '400'}}>Christian's Blood Selector App</p>
                <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Enter Username" className="ios-input" autoFocus />
                    <button type="submit" className="button-reset" disabled={loading || !input.trim()} style={{width: '100%', padding: '16px', fontSize: '1rem', borderRadius: '14px'}}>
                        {loading ? 'Verifying & Logging...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const AccessDenied = ({ onRetry }: { onRetry: () => void }) => (
    <div className="login-screen-wrapper">
        <div className="login-card" style={{border: '1px solid var(--ios-red)'}}>
            <div className="header-icon" style={{width: '56px', height: '56px', margin: '0 auto'}} dangerouslySetInnerHTML={{ __html: exclamationIconRed }} />
            <h1 style={{fontSize: '3rem', margin: '16px 0', fontWeight: '800'}}>404</h1>
            <h3 style={{marginBottom: '10px'}}>Unauthorized</h3>
            <p style={{color: 'var(--ios-dark-gray)', marginBottom: '32px'}}>Your credentials are not registered.</p>
            <button onClick={onRetry} className="button-reset" style={{width: '100%', padding: '12px'}}>Retry</button>
        </div>
    </div>
);

const BiologicalFlow = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let offset = 0;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        };

        const drawWave = (yOffset: number, amplitude: number, frequency: number, speed: number, color: string) => {
            const rect = canvas.getBoundingClientRect();
            ctx.beginPath();
            ctx.moveTo(0, rect.height / 2);

            for (let x = 0; x < rect.width; x++) {
                const y = Math.sin(x * frequency + offset * speed + yOffset) * amplitude + rect.height / 2;
                ctx.lineTo(x, y);
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        };

        const draw = () => {
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
            
            offset += 0.02;

            // Draw multiple overlapping waves with different properties
            drawWave(0, 15, 0.01, 1, 'rgba(0, 94, 184, 0.4)');
            drawWave(Math.PI / 2, 10, 0.015, 0.8, 'rgba(100, 210, 255, 0.3)');
            drawWave(Math.PI, 20, 0.008, 1.2, 'rgba(0, 45, 114, 0.45)');
            drawWave(Math.PI * 1.5, 12, 0.012, 0.5, 'rgba(165, 222, 255, 0.25)');

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener('resize', resize);
        resize();
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="footer-canvas-container">
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
    );
};

const Header = ({ isCompact, onInfoClick }: { isCompact: boolean, onInfoClick: () => void }) => (
    <header className={`app-header ${isCompact ? 'compact' : ''}`}>
        <BiologicalFlow />
        <div className="header-pill-container">
            <div className="header-title-group">
                <div className="header-icon header-icon-glow" dangerouslySetInnerHTML={{ __html: medicalCrossIcon }} />
                <h1 className="header-title">HGP Blood Test Allocator</h1>
            </div>
        </div>
        <button className="info-button" aria-label="Information" onClick={onInfoClick}>
             <div style={{width: '24px', height: '24px'}} dangerouslySetInnerHTML={{ __html: infoIcon }} />
        </button>
    </header>
);

const SelectionCard = ({ formState, handleChange, onReset, hasSelections }: { formState: FormState, handleChange: (key: string, value: any, type: 'toggle' | 'select' | 'disease') => void, onReset: () => void, hasSelections: boolean }) => (
    <div className="card">
        <div className="card-header">
            <span>Select Conditions</span>
            <button className="button-reset" onClick={onReset} disabled={!hasSelections}>Reset</button>
        </div>
        <ul className="list-group">
            {diseases.map(disease => (
                <React.Fragment key={disease.name}>
                    <li className="list-item">
                        <div className="list-item-content" style={{display:'flex', alignItems:'center', gap: '12px'}}>
                            <div className={`list-item-icon ${disease.colorClass}`}>
                                {disease.name.split(' ').map(w => w[0]).join('').substring(0, 3)}
                            </div>
                            <span className="list-item-label">{disease.name}</span>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={formState.selectedDiseases.has(disease.name)} onChange={e => handleChange(disease.name, e.target.checked, 'disease')} />
                            <span className="slider"></span>
                        </label>
                    </li>
                    {formState.selectedDiseases.has(disease.name) && disease.questions?.map(q => (
                         <li key={q.key} className="additional-info-item visible">
                            <label style={{flex: 1}}>{q.label}</label>
                            {q.type === 'toggle' ? (
                                 <label className="toggle-switch">
                                     <input type="checkbox" checked={!!formState[q.key as keyof FormState]} onChange={e => handleChange(q.key, e.target.checked, 'toggle')} />
                                     <span className="slider"></span>
                                 </label>
                            ) : (
                                 <CustomSelect 
                                    value={formState[q.key as 'ckdStage']} 
                                    options={q.options || []} 
                                    onChange={(val) => handleChange(q.key, val, 'select')} 
                                 />
                            )}
                         </li>
                    ))}
                </React.Fragment>
            ))}
        </ul>
    </div>
);

const ResultsCard = ({ results }: { results: CalculatedTest[] }) => {
    if (results.length === 0) {
        return (
            <div className="card">
                <div className="card-header">Required Tests</div>
                <div className="results-placeholder">
                    <div className="placeholder-icon" dangerouslySetInnerHTML={{ __html: animatedPlaceholderIcon }} />
                    <p>Select conditions to see results.</p>
                </div>
            </div>
        );
    }
    return (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {results.map((test, index) => (
                <div className="card" key={test.testName} style={{ animationDelay: `${index * 40}ms`, marginBottom: 0 }}>
                    <div className="card-header result-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="pulse-icon-container" dangerouslySetInnerHTML={{ __html: getTestIcon(test.testName) }} style={{ display: 'flex', alignItems: 'center' }} />
                            <span>{test.testName}</span>
                        </div>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {test.frequencies.map((freq, fi) => {
                            const isMonitoring = isMonitoringFrequency(freq.frequency);
                            return (
                                <div key={fi} className="frequency-group" style={{ marginTop: fi === 0 ? 0 : '14px' }}>
                                    <div className="vertical-indicator"></div>
                                    <div className="frequency-container">
                                        <div className={`category-header ${isMonitoring ? 'monitoring' : 'other'}`}>
                                            <div className={`category-icon ${isMonitoring ? 'icon-monitoring-glow' : ''}`} 
                                                 dangerouslySetInnerHTML={{ __html: isMonitoring ? sparkleIcon : exclamationIcon }} />
                                            <span>{isMonitoring ? 'Monitoring' : 'Diagnostic'}</span>
                                        </div>
                                        <div className="frequency-details">
                                            <span className={`frequency-tag ${getFrequencyColor(freq.frequency)}`}>{freq.frequency}</span>
                                            <span className="disease-info">for {freq.diseases.join(', ')}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const MainApp = ({ userId, onLogout }: { userId: string, onLogout: () => void }) => {
    const initialState: FormState = { selectedDiseases: new Set(), isOnDOAC: false, isOnLithium: false, isOnAntipsychotics: false, isOnMetformin: false, ckdStage: '3a' };
    const [formState, setFormState] = useState<FormState>(initialState);
    const [isCompact, setIsCompact] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isAdminBuilderOpen, setIsAdminBuilderOpen] = useState(false);
    const [adminInitialTab, setAdminInitialTab] = useState<'broadcast' | 'governance'>('broadcast');
    const [announcement, setAnnouncement] = useState<{ id: number; title: string; message: string; badgeType: string } | null>(null);

    const isAdmin = userId.trim().toLowerCase() === 'cjw';

    const [loginCount, setLoginCount] = useState<number | null>(() => {
        const stored = localStorage.getItem(`hgp_logins_${userId.toLowerCase()}`);
        return stored ? parseInt(stored, 10) : null;
    });
    const [totalLogins, setTotalLogins] = useState<number | null>(() => {
        const stored = localStorage.getItem(`hgp_total_logins_count`);
        return stored ? parseInt(stored, 10) : null;
    });
    const trackingTimerRef = useRef<number | null>(null);

    useEffect(() => {
        const sessionKey = `hgp_logged_session_${userId}`;
        if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, 'true');
            logUserLogin(userId).then(res => {
                if (res.userLoginCount) setLoginCount(res.userLoginCount);
                if (res.totalLogins) setTotalLogins(res.totalLogins);
            });
        }

        // Fetch active popup announcement
        fetch('/api/announcement')
            .then(res => res.json())
            .then(data => {
                if (data.active && data.announcement) {
                    const ackKey = `hgp_ack_announcement_${data.announcement.id}`;
                    if (!sessionStorage.getItem(ackKey)) {
                        setAnnouncement(data.announcement);
                    }
                }
            })
            .catch(() => {});
    }, [userId]);

    useEffect(() => {
        const onScroll = () => setIsCompact(window.scrollY > 40);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const calculatedTests = useMemo(() => calculateRequiredTests(formState), [formState]);

    useEffect(() => {
        if (formState.selectedDiseases.size === 0) return;
        if (trackingTimerRef.current) window.clearTimeout(trackingTimerRef.current);
        trackingTimerRef.current = window.setTimeout(async () => {
            if (TRACKING_WEBHOOK_URL) {
                try {
                    await fetch(TRACKING_WEBHOOK_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({ 
                            action: 'track_conditions',
                            user: userId, 
                            conditions: Array.from(formState.selectedDiseases),
                            timestamp: new Date().toISOString()
                        })
                    });
                } catch (e) { console.error("Tracking error", e); }
            }
        }, 5000);
        return () => { if (trackingTimerRef.current) window.clearTimeout(trackingTimerRef.current); };
    }, [formState, userId]);
    
    const handleChange = (key: string, value: any, type: string) => {
        setFormState(prev => {
            if (type === 'disease') {
                const next = new Set(prev.selectedDiseases);
                value ? next.add(key) : next.delete(key);
                return { ...prev, selectedDiseases: next };
            }
            return { ...prev, [key]: value };
        });
    };

    return (
        <>
            {announcement && (
                <AnnouncementModal
                    announcement={announcement}
                    username={userId}
                    onClose={() => setAnnouncement(null)}
                />
            )}
            <Header isCompact={isCompact} onInfoClick={() => setIsInfoModalOpen(true)} />
            <div className="app-container">
                {/* Full Width Top Admin / Staff Bar */}
                <div className="status-bar-full">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isAdmin ? '#FFD700' : 'var(--ios-green)',
                            boxShadow: isAdmin ? '0 0 10px #FFD700' : '0 0 8px var(--ios-green)',
                            display: 'inline-block'
                        }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--ios-label-primary)' }}>
                            Staff: <strong>{userId}</strong> {isAdmin && <span style={{ color: '#FFD700', fontSize: '0.75rem', fontWeight: '700', marginLeft: '4px' }}>(Super Admin)</span>}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isAdmin && (
                            <button
                                onClick={() => { setAdminInitialTab('broadcast'); setIsAdminBuilderOpen(true); }}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.75rem',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #FFD700, #FF9500)',
                                    color: '#000',
                                    border: 'none',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(255, 215, 0, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                👑 Admin Master Panel
                            </button>
                        )}
                        {loginCount !== null && (
                            <span style={{
                                fontSize: '0.75rem',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                background: 'rgba(0, 94, 184, 0.2)',
                                color: '#64D2FF',
                                border: '1px solid rgba(100, 210, 255, 0.2)',
                                fontWeight: '500'
                            }}>
                                Login #{loginCount}
                            </span>
                        )}
                        <button 
                            onClick={() => setIsInfoModalOpen(true)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--ios-dark-gray)',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                textDecoration: 'underline'
                            }}
                        >
                            Log Details
                        </button>
                        <button 
                            onClick={onLogout}
                            style={{
                                background: 'rgba(255, 69, 58, 0.12)',
                                border: '1px solid rgba(255, 69, 58, 0.3)',
                                color: 'var(--ios-red)',
                                fontSize: '0.75rem',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            🚪 Sign Out
                        </button>
                    </div>
                </div>

                {/* 2-Column CSS Grid Layout */}
                <main className="app-main-grid">
                    <div className="grid-col-left">
                        <SelectionCard formState={formState} handleChange={handleChange} onReset={() => setFormState(initialState)} hasSelections={formState.selectedDiseases.size > 0} />
                    </div>
                    <div className="grid-col-right">
                        <ResultsCard results={calculatedTests} />
                    </div>
                </main>
            </div>
            <InfoModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                currentUsername={userId}
                onOpenAdminGovernance={() => {
                    setAdminInitialTab('governance');
                    setIsAdminBuilderOpen(true);
                }}
            />
            <AdminModalBuilder
                isOpen={isAdminBuilderOpen}
                onClose={() => setIsAdminBuilderOpen(false)}
                currentUsername={userId}
                initialTab={adminInitialTab}
                onLogout={onLogout}
            />
            <footer className="app-footer">
                <BiologicalFlow />
                <p className="footer-text">
                    Designed & Developed by <a href="https://christian-whitehead.vercel.app/" target="_blank" style={{ color: '#FFFFFF', textDecoration: 'none', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                        <span className="luminous-green">Christian</span> Whitehead
                    </a> for <a href="https://www.harwoodgrouppractice.co.uk" target="_blank" style={{ color: '#FFFFFF' }}>Harwood Group Practice</a>
                </p>
            </footer>
        </>
    );
};

export default function App() {
    const StaffIdParam = new URLSearchParams(window.location.search).get('user');
    const [userId, setUserId] = useState<string | null>(() => {
        return StaffIdParam || sessionStorage.getItem('staff_id');
    });

    const handleRetry = () => {
        sessionStorage.removeItem('staff_id');
        setUserId(null);
    };

    const handleLogout = () => {
        sessionStorage.removeItem('staff_id');
        setUserId(null);
    };

    if (!userId) return <LoginScreen onLogin={(id) => { sessionStorage.setItem('staff_id', id); setUserId(id); }} />;
    if (userId === 'DENIED_USER') return <AccessDenied onRetry={handleRetry} />;
    
    return <MainApp userId={userId} onLogout={handleLogout} />;
}
