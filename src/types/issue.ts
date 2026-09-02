export const ISSUE_STATUS = {
  open: "未対応",
  done: "改修完了",
} as const;

export type IssueSheetRow = {
  rowNumber: number;
  reportedAt: string;
  assignedStore: string;
  transactionDate: string;
  vendorName: string;
  failedFields: string;
  note: string;
  fileName: string;
  fileUrl: string;
  status: string;
};
