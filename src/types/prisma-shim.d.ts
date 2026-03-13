declare module "@prisma/client" {
  export class PrismaClient {
    constructor(...args: any[])
    $connect(): Promise<void>
    $disconnect(): Promise<void>
    $transaction<T>(arg: any): Promise<T>
    $transaction<T extends any[]>(arg: [...T]): Promise<T>
    [key: string]: any
  }

  export namespace Prisma {
    type JsonValue = any;
    type JsonObject = Record<string, any>;
    type JsonArray = any[];
  }

  export type JsonValue = any;
  export type JsonObject = Record<string, any>;
  export type JsonArray = any[];

  export const QuestionSetStatus: { DRAFT: "DRAFT"; PUBLISHED: "PUBLISHED" };
  export type QuestionSetStatus = "DRAFT" | "PUBLISHED";
  export const ContentLane: { TEST_NOW: "TEST_NOW"; TRAINING: "TRAINING"; CERTIFICATIONS: "CERTIFICATIONS" };
  export type ContentLane = "TEST_NOW" | "TRAINING" | "CERTIFICATIONS";
  export const CertExam: { A_PLUS: "A_PLUS"; SECURITY_PLUS: "SECURITY_PLUS"; AZ_900: "AZ_900" };
  export type CertExam = "A_PLUS" | "SECURITY_PLUS" | "AZ_900";
  export const StartingPosition: { HELPDESK_SUPPORT: "HELPDESK_SUPPORT"; DESKTOP_TECHNICIAN: "DESKTOP_TECHNICIAN"; CLOUD_ENGINEER: "CLOUD_ENGINEER" };
  export type StartingPosition = "HELPDESK_SUPPORT" | "DESKTOP_TECHNICIAN" | "CLOUD_ENGINEER";
  export const QuestionDomain: { IDENTITY: "IDENTITY"; NETWORKING: "NETWORKING"; SECURITY: "SECURITY"; COMPUTE: "COMPUTE"; STORAGE: "STORAGE"; AZURE: "AZURE"; AWS: "AWS"; WINDOWS: "WINDOWS"; GENERAL: "GENERAL"; };
  export type QuestionDomain = "IDENTITY" | "NETWORKING" | "SECURITY" | "COMPUTE" | "STORAGE" | "AZURE" | "AWS" | "WINDOWS" | "GENERAL";
  export const QuestionType: { MULTIPLE_CHOICE: "MULTIPLE_CHOICE"; FILL_BLANK: "FILL_BLANK"; SEQUENCE_ORDER: "SEQUENCE_ORDER"; MULTI_SELECT: "MULTI_SELECT"; INCIDENT: "INCIDENT"; CLI_COMMAND: "CLI_COMMAND"; };
  export type QuestionType = "MULTIPLE_CHOICE" | "FILL_BLANK" | "SEQUENCE_ORDER" | "MULTI_SELECT" | "INCIDENT" | "CLI_COMMAND";
}
