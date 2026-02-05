import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Types
type FormState = {
    selectedDiseases: Set<string>;
    isOnDOAC: boolean;
    isOnLithium: boolean;
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


// Data
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
    { name: "Mental Health", colorClass: "icon-blue", questions: [{ key: 'isOnLithium', label: 'Is the patient on Lithium?', type: 'toggle' }] },
    { name: "NHS Health Check", colorClass: "icon-green" },
    { name: "Non-Diabetic Hyperglycaemia", colorClass: "icon-orange" },
    { name: "Stroke/TIA", colorClass: "icon-purple" },
    { name: "B12 Anemia", colorClass: "icon-yellow" },
];

const bloodTests: Record<string, Record<string, any>> = {
    "FBC": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Diabetes Mellitus": "Annually", "Chronic Kidney Disease": "Annually", "B12 Anemia": "10 days after starting treatment" },
    "U&Es": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Hypertension": "Annually", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "3 monthly", falseFrequency: "Annually" }, "Chronic Kidney Disease": "Frequency based on CKD stage", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "LFTs": { "Atrial Fibrillation": { conditionKey: "isOnDOAC", trueFrequency: "Annually", falseFrequency: null }, "Coronary Heart Disease": "Annually", "Heart Failure": "Annually", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": "Annually", "NHS Health Check": "5 yearly (40-74 years)" },
    "HbA1c": { "Atrial Fibrillation": "At diagnosis & every 3-5 years", "Coronary Heart Disease": "At diagnosis & every 3-5 years", "Heart Failure": "At diagnosis & every 3-5 years", "Hypertension": "At diagnosis & every 3-5 years", "Stroke/TIA": "Annually", "Diabetes Mellitus": "6 monthly", "Mental Health": "Annually", "Chronic Kidney Disease": "At diagnosis & every 3-5 years", "Non-Diabetic Hyperglycaemia": "Annually", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "TFTs": { "Atrial Fibrillation": "At diagnosis", "Diabetes Mellitus": "At diagnosis & every 3-5 years", "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "6 monthly", falseFrequency: "Annually" }, "Hypothyroidism": "Annually if stable. After 3 months if dose changed" },
    "LIPIDS": { "Coronary Heart Disease": "Annually", "Heart Failure": "Annually (if on statin)", "Hypertension": "Following diagnosis to check CVD risk", "Stroke/TIA": "Annually", "Diabetes Mellitus": "Annually", "Mental Health": "Annually", "Chronic Kidney Disease": "Annually", "NHS Health Check": "5 yearly (40-74 years)", "Cardiovascular Disease": "Annually" },
    "LITHIUM": { "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "3 monthly", falseFrequency: null } },
    "CALCIUM": { "Mental Health": { conditionKey: "isOnLithium", trueFrequency: "6 monthly", falseFrequency: null }, "Chronic Kidney Disease": "Frequency based on CKD stage" },
    "BNP": { "Heart Failure": "Once to make diagnosis. NO MONITORING" },
    "B12": { "Diabetes Mellitus": { conditionKey: "isOnMetformin", trueFrequency: "Annually", falseFrequency: null }, "B12 Anemia": "To make diagnosis & 1-2 months after treatment. NO MONITORING" },
    "URINE (ACR)": { "Diabetes Mellitus": "Annually", "Chronic Kidney Disease": "Annually" }
};

// Logic
const IS_MONITORING_EXCLUSIONS_INCLUDE = ["diagnosis", "to check cvd risk", "make diagnosis", "no monitoring", "after starting treatment"];
const IS_MONITORING_EXCLUSIONS_EXACT: string[] = [];

const isMonitoringFrequency = (freq: string): boolean => {
    const lowerFreq = freq.toLowerCase().trim();
    
    // Exception for hybrid frequencies like "At diagnosis & every 3-5 years"
    if (lowerFreq.includes("diagnosis") && lowerFreq.includes("every")) {
        return true;
    }

    if (IS_MONITORING_EXCLUSIONS_EXACT.includes(lowerFreq)) {
        return false;
    }
    for (const term of IS_MONITORING_EXCLUSIONS_INCLUDE) {
        if (lowerFreq.includes(term)) {
            return false;
        }
    }
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

const calculateRequiredTests = (formState: FormState): CalculatedTest[] => {
    // Step 1: Aggregate all test data first.
    const requiredTestsData: Record<string, { frequencies: Record<string, Set<string>> }> = {};
    const selectedDiseases = Array.from(formState.selectedDiseases);

    for (const [testName, conditionsForTest] of Object.entries(bloodTests)) {
        selectedDiseases.forEach(disease => {
            if (conditionsForTest.hasOwnProperty(disease)) {
                let rawFrequencyEntry = conditionsForTest[disease];
                let determinedFrequency: string | null = null;
                let diseaseLabel = disease;

                if (typeof rawFrequencyEntry === 'string') {
                    determinedFrequency = rawFrequencyEntry;
                } else if (typeof rawFrequencyEntry === 'object' && rawFrequencyEntry !== null && rawFrequencyEntry.conditionKey) {
                    const conditionMet = formState[rawFrequencyEntry.conditionKey as keyof FormState];
                    determinedFrequency = conditionMet ? rawFrequencyEntry.trueFrequency : rawFrequencyEntry.falseFrequency;
                    if (conditionMet && determinedFrequency === rawFrequencyEntry.trueFrequency) {
                        if (rawFrequencyEntry.conditionKey === "isOnLithium") diseaseLabel = `${disease} (on Lithium)`;
                        if (rawFrequencyEntry.conditionKey === "isOnMetformin") diseaseLabel = `${disease} (on Metformin)`;
                        if (rawFrequencyEntry.conditionKey === "isOnDOAC") diseaseLabel = `${disease} (on DOAC)`;
                    }
                }
                
                if (disease === "Chronic Kidney Disease") {
                     const ckdFreq = getCKDFrequency(formState.ckdStage, testName);
                     if (ckdFreq !== undefined) {
                         determinedFrequency = ckdFreq;
                         if (ckdFreq) diseaseLabel = `Chronic Kidney Disease (Stage ${formState.ckdStage.toUpperCase()})`;
                     }
                }

                if (determinedFrequency && determinedFrequency !== "Frequency based on CKD stage") {
                    if (!requiredTestsData[testName]) requiredTestsData[testName] = { frequencies: {} };
                    if (!requiredTestsData[testName].frequencies[determinedFrequency]) requiredTestsData[testName].frequencies[determinedFrequency] = new Set();
                    requiredTestsData[testName].frequencies[determinedFrequency].add(diseaseLabel);
                }
            }
        });
    }

    // Step 2: Map the aggregated data to the final structure.
    const calculatedTests = Object.entries(requiredTestsData).map(([testName, data]) => {
        return {
            testName,
            frequencies: Object.entries(data.frequencies).map(([frequency, diseasesSet]) => ({
                frequency,
                diseases: Array.from(diseasesSet),
            })),
        };
    });
    
    // Step 3: Sort the final list.
    const desiredOrder = ["U&Es", "LFTs", "CALCIUM", "LIPIDS", "TFTs", "B12", "URINE (ACR)", "FBC", "HbA1c", "LITHIUM", "BNP"];
    
    calculatedTests.sort((a, b) => {
        const indexA = desiredOrder.indexOf(a.testName);
        const indexB = desiredOrder.indexOf(b.testName);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return calculatedTests;
};


// Icons
const medicalCrossIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2 H 14 V 10 H 22 V 14 H 14 V 22 H 10 V 14 H 2 V 10 H 10 V 2 z"/></svg>`;
const exclamationIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg`;
const exclamationIconRed = `<svg viewBox="0 0 24 24" fill="var(--ios-red)"><path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg`;
const animatedPlaceholderIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 5.5C15.5 4.39705 14.6029 3.5 13.5 3.5H10.5C9.39705 3.5 8.5 4.39705 8.5 5.5V11.5H5.5C4.39705 11.5 3.5 12.3971 3.5 13.5V18.5C3.5 20.1569 4.84315 21.5 6.5 21.5H17.5C19.1569 21.5 20.5 20.1569 20.5 18.5V13.5C20.5 12.3971 19.6029 11.5 18.5 11.5H15.5V5.5ZM13.5 5.5H10.5V11.5H13.5V5.5ZM18.5 13.5V18.5C18.5 19.0523 18.0523 19.5 17.5 19.5H6.5C5.94772 19.5 5.5 19.0523 5.5 18.5V13.5H18.5Z"/></svg>`;
const sparkleIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.4 10.6 L22 12 L13.4 13.4 L12 22 L10.6 13.4 L2 12 L10.6 10.6 Z"/></svg`;
const infoIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;

const getFrequencyColor = (freq: string) => {
    const lowerFreq = freq.toLowerCase();
    if (lowerFreq.includes("5 yearly")) return 'tag-red';

    if (!isMonitoringFrequency(freq)) {
        return 'tag-gray';
    }
    
    if (lowerFreq.includes("annually")) return 'tag-green';
    if (lowerFreq.includes("6 monthly") || lowerFreq.includes("every 4-6 months")) return 'tag-purple';
    if (lowerFreq.includes("3 monthly")) return 'tag-indigo';
    if (lowerFreq.includes("monthly")) return 'tag-pink';
    if (lowerFreq.includes("yearly") || lowerFreq.includes("years")) return 'tag-teal';
    return 'tag-gray';
};

// Utility to get current date in DD/MM/YYYY format
const getFormattedDate = () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Info Popup Content (refactored to HTML string for detailed styling)
const INFO_POPUP_HTML = `
    <h3>⚠️ Clinical Validation & Governance Check</h3>
    <p><strong>Please verify the test profile before finalizing the request</strong></p>

    <p>To maintain clinical safety and optimize resource allocation, staff must validate that this request is both comprehensive and necessary.</p>

    <h4 class="main-section-title">1. Clinical Monitoring and Omissions</h4>
    <ul class="sub-list">
        <li>
            <h4 class="sub-section-title">High-Risk Medication</h4>
            <p>Have you cross-referenced the medication profile for drug-specific safety bloods such as Shared Care protocols, DMARDs, or renal/liver monitoring?</p>
        </li>
        <li>
            <h4 class="sub-section-title">High-Risk and Chronic Disease</h4>
            <p>Are all relevant CVD, Diabetes High-Risk, and Thyroid (TFT) monitoring markers included? <span class="important-marker">${exclamationIconRed} <span class="important-label" style="color: #FF453A !important;">IMPORTANT</span></span></p>
        </li>
        <li>
            <h4 class="sub-section-title">QOF Compliance</h4>
            <p>Have you checked the Quality and Outcomes Framework box to close any outstanding annual review care gaps?</p>
        </li>
    </ul>

    <h4 class="main-section-title">2. Duplicate Prevention</h4>
    <ul class="sub-list">
        <li>
            <h4 class="sub-section-title">Secondary Care Review</h4>
            <p>Have you checked for recent hospital or specialist bloods? If tests were recently performed in secondary care and remain within the valid clinical window, do not duplicate them.</p>
        </li>
    </ul>

    <h4 class="main-section-title">3. Integrated Diagnostics</h4>
    <ul class="sub-list">
        <li>
            <h4 class="sub-section-title">Annual Review Preparation</h4>
            <p>If a urine test is required, ensure the phlebotomist is alerted to provide the patient with a specimen pot, using the following action:</p>
        </li>
        <li>
            <h4 class="sub-section-title">Action Required</h4>
            <p>Please add a screen comment underneath the patient’s blood appointment slot: <span class="indented-quote">"Please provide urine pot for annual review"</span></p>
        </li>
    </ul>

    <hr class="section-divider">

    <h4 class="footer-section-title">Clinical Governance Note</h4>
    <p class="disclaimer-text">Thorough verification prevents unnecessary phlebotomy, ensures data continuity across care settings, and maximizes QOF achievement for the practice.</p>

    <div class="actions">
        <button class="confirm-button" data-testid="confirm-review-button"><strong>I Confirm</strong></button>
    </div>
    <p class="edited-by-disclaimer">Last edited by Christian Whitehead on <span id="current-date-placeholder"></span></p>
`;

// Info Popup Component
const InfoPopup = ({ messageHtml, style, onConfirm }: { messageHtml: string, style: React.CSSProperties, onConfirm: () => void }) => {
    const rootDivRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (rootDivRef.current) {
            // Set the dynamic date
            const dateSpan = rootDivRef.current.querySelector('#current-date-placeholder');
            if (dateSpan) {
                dateSpan.textContent = getFormattedDate();
            }

            const confirmButton = rootDivRef.current.querySelector('[data-testid="confirm-review-button"]');
            if (confirmButton) {
                const handleClick = (event: MouseEvent) => {
                    event.stopPropagation(); // Prevent immediate closing due to outer click handlers
                    onConfirm();
                };
                confirmButton.addEventListener('click', handleClick);
                return () => {
                    confirmButton.removeEventListener('click', handleClick);
                };
            }
        }
    }, [onConfirm, messageHtml]); // Re-run if messageHtml changes, ensuring elements are found

    return (
        <div className="clinical-popup" style={style} ref={rootDivRef} dangerouslySetInnerHTML={{ __html: INFO_POPUP_HTML }}>
        </div>
    );
};

// Components
const Header = ({ isCompact }: { isCompact: boolean }) => {
    const [showInfoPopup, setShowInfoPopup] = useState(false);
    const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
    const infoButtonRef = useRef<HTMLButtonElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null); // Ref for the overlay

    const toggleInfoPopup = (event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent immediate document click from closing it
        setShowInfoPopup(prev => !prev);
    };

    useEffect(() => {
        if (showInfoPopup && infoButtonRef.current) {
            const buttonRect = infoButtonRef.current.getBoundingClientRect();
            
            // Calculate position to the right of the info button with some offset
            const offset = 10; // Pixels offset from button
            const right = window.innerWidth - buttonRect.right + offset;
            const top = buttonRect.bottom + offset;

            setPopupStyle({
                position: 'fixed',
                top: `${top}px`,
                right: `${right}px`,
                // Ensure the popup doesn't go off screen
                maxHeight: `calc(100vh - ${top + offset}px)`,
                maxWidth: `min(480px, 100vw - ${right + offset}px)`,
                overflowY: 'auto', // Enable scrolling if content exceeds maxHeight
                transformOrigin: 'top right',
            });
        }

        const handleClickOutside = (event: MouseEvent) => {
            // If the overlay exists and a click occurs outside the popup AND outside the info button
            if (
                showInfoPopup &&
                overlayRef.current && overlayRef.current.contains(event.target as Node) && // Click is within the overlay
                !infoButtonRef.current?.contains(event.target as Node) // And not on the info button
            ) {
                // We don't check popupRef.current directly here, as InfoPopup's rootDivRef is dynamically set via dangerouslySetInnerHTML.
                // Instead, the InfoPopup component manages its own click handling for the 'I Confirm' button.
                // For clicking outside the popup, we'll assume the overlay itself signals intent to close,
                // unless the click originated from the info button which *opens* the popup.
                // This simplifies external click handling since the whole overlay is tied to closing.
                 if (!(event.target as HTMLElement).closest('.clinical-popup')) {
                     setShowInfoPopup(false);
                 }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showInfoPopup]); // Re-calculate style when popup visibility changes

    return (
        <header className={`app-header ${isCompact ? 'compact' : ''}`}>
            <div className="header-title-group">
                <div className="header-icon" dangerouslySetInnerHTML={{ __html: medicalCrossIcon }} />
                <h1>HGP Blood Test Allocator</h1>
            </div>
            <button 
                className="info-button" 
                aria-label="Information" 
                title="App Information"
                onClick={toggleInfoPopup}
                ref={infoButtonRef}
            >
                 <div dangerouslySetInnerHTML={{ __html: infoIcon }} />
            </button>
            {showInfoPopup && (
                <>
                    <div className="popup-overlay" ref={overlayRef}></div>
                    <InfoPopup
                        messageHtml={INFO_POPUP_HTML}
                        style={popupStyle}
                        onConfirm={() => setShowInfoPopup(false)}
                    />
                </>
            )}
        </header>
    );
};

const SelectionCard = ({ formState, handleChange, onReset, hasSelections }: { formState: FormState, handleChange: (key: string, value: any, type: 'toggle' | 'select' | 'disease') => void, onReset: () => void, hasSelections: boolean }) => {
    const isQuestionVisible = (disease: Disease) => formState.selectedDiseases.has(disease.name) && disease.questions;

    return (
        <div className="card">
            <div className="card-header">
                <span>Select Conditions</span>
                <button className="button-reset" onClick={onReset} disabled={!hasSelections}>Reset</button>
            </div>
            <ul className="list-group">
                {diseases.map((disease) => (
                    <React.Fragment key={disease.name}>
                        <li className="list-item">
                            <div className="list-item-content">
                                <div className={`list-item-icon ${disease.colorClass}`}>
                                    {disease.name.split(' ').map(w => w[0]).join('').substring(0, 3)}
                                </div>
                                <span className="list-item-label">{disease.name}</span>
                            </div>
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={formState.selectedDiseases.has(disease.name)}
                                    onChange={(e) => handleChange(disease.name, e.target.checked, 'disease')}
                                />
                                <span className="slider"></span>
                            </label>
                        </li>
                        {isQuestionVisible(disease) && disease.questions?.map(q => (
                             <li key={q.key} className={`additional-info-item ${isQuestionVisible(disease) ? 'visible' : ''}`}>
                                <label htmlFor={q.key}>{q.label}</label>
                                {q.type === 'toggle' && (
                                     <label className="toggle-switch">
                                         <input type="checkbox" checked={!!formState[q.key as keyof FormState]} onChange={e => handleChange(q.key, e.target.checked, 'toggle')} />
                                         <span className="slider"></span>
                                     </label>
                                )}
                                {q.type === 'select' && q.options && (
                                     <div className="select-wrapper">
                                        <select id={q.key} value={formState[q.key as 'ckdStage']} onChange={e => handleChange(q.key, e.target.value, 'select')}>
                                             {q.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                         </select>
                                     </div>
                                )}
                             </li>
                        ))}
                    </React.Fragment>
                ))}
            </ul>
        </div>
    );
};

const ResultsCard = ({ results }: { results: CalculatedTest[] }) => {
    if (results.length === 0) {
        return (
            <div className="card">
                <div className="card-header">Required Tests</div>
                <div className="results-placeholder">
                    <div className="placeholder-icon" dangerouslySetInnerHTML={{ __html: animatedPlaceholderIcon }} />
                    <p>Select one or more conditions to see the required blood tests.</p>
                </div>
            </div>
        );
    }
    
    const listKey = results.map(r => r.testName).join('-');

    return (
        <div className="card">
            <div className="card-header">Required Tests</div>
            <ul className="results-list" key={listKey}>
                {results.map((test, index) => {
                    const monitoringFreqs = test.frequencies.filter(f => isMonitoringFrequency(f.frequency));
                    const diagnosticFreqs = test.frequencies.filter(f => !isMonitoringFrequency(f.frequency));

                    return (
                        <li className="result-item" key={test.testName} style={{ animationDelay: `${index * 50}ms` }}>
                            <span className="test-name">{test.testName}</span>
                            {monitoringFreqs.length > 0 && (
                                <div className="result-category">
                                    <div className="category-header">
                                        <div className="category-icon monitoring-icon" dangerouslySetInnerHTML={{ __html: sparkleIcon }} />
                                        <span>Monitoring</span>
                                    </div>
                                    <div className="frequencies-container">
                                        {monitoringFreqs.map((frequency, freqIndex) => (
                                            <div className="frequency-group" key={freqIndex}>
                                                <span className={`frequency-tag ${getFrequencyColor(frequency.frequency)}`}>{frequency.frequency}</span>
                                                <span className="disease-info">for {frequency.diseases.join(', ')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {diagnosticFreqs.length > 0 && (
                                <div className="result-category">
                                    <div className="category-header">
                                        <div className="category-icon diagnostic-icon" dangerouslySetInnerHTML={{ __html: exclamationIcon }} />
                                        <span>Diagnostic / Other</span>
                                    </div>
                                    <div className="frequencies-container">
                                        {diagnosticFreqs.map((frequency, freqIndex) => (
                                            <div className="frequency-group" key={freqIndex}>
                                                <span className={`frequency-tag ${getFrequencyColor(frequency.frequency)}`}>{frequency.frequency}</span>
                                                <span className="disease-info">for {frequency.diseases.join(', ')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

const Footer = () => (
    <footer className="app-footer">
        <p>
            <span className="footer-text">
                Created by Christian Whitehead for{' '}
                <a href="https://www.harwoodgrouppractice.co.uk" target="_blank" rel="noopener noreferrer">
                    Harwood Group Practice
                </a>
            </span>
        </p>
    </footer>
);


const App = () => {
    const initialState: FormState = {
        selectedDiseases: new Set(),
        isOnDOAC: false,
        isOnLithium: false,
        isOnMetformin: false,
        ckdStage: '3a',
    };

    const [formState, setFormState] = useState<FormState>(initialState);
    const [isCompact, setIsCompact] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsCompact(window.scrollY > 50); // Becomes compact after 50px scroll
        };

        window.addEventListener('scroll', handleScroll);
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const calculatedTests = useMemo(() => calculateRequiredTests(formState), [formState]);
    
    // Define handleChange function
    const handleChange = (key: string, value: any, type: 'toggle' | 'select' | 'disease') => {
        setFormState(prev => {
            if (type === 'disease') {
                const newSelectedDiseases = new Set(prev.selectedDiseases);
                if (value) {
                    newSelectedDiseases.add(key);
                } else {
                    newSelectedDiseases.delete(key);
                }
                return { ...prev, selectedDiseases: newSelectedDiseases };
            } else {
                return { ...prev, [key]: value };
            }
        });
    };

    const handleReset = () => {
        setFormState(initialState);
    };

    const hasSelections = formState.selectedDiseases.size > 0 || formState.isOnDOAC || formState.isOnLithium || formState.isOnMetformin;

    return (
        <>
            <Header isCompact={isCompact} />
            <div className="app-container">
                <main className="main-content">
                    <SelectionCard formState={formState} handleChange={handleChange} onReset={handleReset} hasSelections={hasSelections} />
                    <ResultsCard results={calculatedTests} />
                </main>
            </div>
            <Footer />
        </>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}