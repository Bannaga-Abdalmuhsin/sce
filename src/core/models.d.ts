export type Bilingual = { en: string; ar: string };
export type Severity = 'Critical' | 'Major' | 'Minor' | 'Information';
export type Decision = 'pending' | 'accepted' | 'rejected' | 'resolved';
export interface Project {
  name: string; city: string; buildingType: string; revision: string;
  client: string; reviewer: string; license: string;
  baselineMinutes?: number; reviewMinutes?: number;
}
export interface Equipment {
  id: string; label: string; drawingLabel: string; loadKW: number; voltage: number;
  powerFactor: number; lengthM: number; cableMM2: number; breakerA: number;
  ampacityA: number; deratingFactor: number; earthing: boolean;
  breakingCapacityKA: number | null; phaseLoadsKW: [number, number, number];
  location: string; confidence: number;
}
export interface Calculation {
  equipmentId: string; currentA: number; voltageDropPct: number;
  correctedAmpacityA: number; formula: string; voltageDropFormula: string;
  assumptions: string;
}
export interface Rule {
  id: string; title: Bilingual; pack: string; version: string; source: string;
  edition: string; clause: string; discipline: string; inputs: string[];
  method: string; logic: string; severity: Severity; action: Bilingual;
  effectiveDate: string; verificationStatus: string; active: boolean;
  history: { date: string; change: string }[]; testResult: string;
}
export interface Finding {
  id: string; severity: Severity; title: Bilingual; equipmentId: string;
  location: string; extractedValue: string; expectedRequirement: string;
  calculation: string; ruleId: string; ruleVersion: string; confidence: number;
  recommendedAction: Bilingual;
  evidence: { drawing: string; extracted: string; calculation: string; rule: string; finding: string; correctiveAction: string };
  decision: Decision; comment: string; reviewer: string; reviewedAt: string | null; fingerprint: string;
}
export interface Check { ruleId: string; equipmentId: string; result: 'pass' | 'fail' | 'review'; detail: string }
export interface AuditEvent { id: string; timestamp: string; action: string; actor: string; detail: string }
export interface Comment { id: string; findingId: string; comment: string; reviewer: string; timestamp: string }
export interface Drawing { name: string; size: number; type: string; adapter: 'demo'; evidenceLabel: string }
export interface Signoff { reviewer: string; license: string; comment: string; timestamp: string; statement: string }
export interface Assessment {
  id: string; demo: boolean; createdAt: string; updatedAt: string; project: Project;
  drawing: Drawing | null; equipment: Equipment[]; connections: { from: string; to: string }[];
  calculations: Calculation[]; findings: Finding[]; checks: Check[]; comments: Comment[];
  audit: AuditEvent[]; signoff: Signoff | null; report: null;
  stage: 'project' | 'upload' | 'ready' | 'review' | 'completed'; progress: number; dirty: boolean;
}