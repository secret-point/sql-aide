import { testingAsserts as ta } from "../../deps-test.ts";
import * as ws from "../../lib/universal/whitespace.ts";
import * as SQLa from "../../render/mod.ts";
import * as mod from "./governed.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export function syntheticSchema() {
  const gm = mod.GovernedIM.typical();
  const gmAuditable = mod.GovernedIM.auditable();
  const { domains: sd, tcFactory: tcf, keys, housekeeping } = gm;
  const { housekeeping: housekeepingAuditable } = gmAuditable;

  enum HostType {
    linux, // code is text, value is a number
    windows,
  }

  const hostType = gm.ordinalEnumTable("host_type", HostType);

  const publHost = gm.textPkTable("publ_host", {
    publ_host_id: keys.textPrimaryKey(),
    host: tcf.unique(sd.text()),
    host_identity: sd.jsonTextNullable(),
    host_type_code: hostType.references.code(),
    mutation_count: sd.integer(),
    ...housekeeping.columns,
  });

  // TODO: SELECT * is bad so use SELECT ${publHost.columnsAll} or similar
  const { columns: phc } = publHost;
  const publHostView = gm.safeView(
    "publ_host_vw",
    publHost.zoSchema.shape,
  )`SELECT * FROM ${publHost.tableName} WHERE ${phc.host} = 'my_host'`;

  enum BuildEventType {
    code1 = "value1",
    code2 = "value2",
  }

  const buildEventType = gm.textEnumTable(
    "build_event_type",
    BuildEventType,
    { isIdempotent: true },
  );

  const publBuildEventName = "publ_build_event" as const;
  const publBuildEvent = gm.autoIncPkTable(publBuildEventName, {
    publ_build_event_id: keys.autoIncPrimaryKey(),
    publ_host_id: publHost.references.publ_host_id(),
    build_event_type: buildEventType.references.code(),
    iteration_index: sd.integer(),
    build_initiated_at: sd.dateTime(),
    build_completed_at: sd.dateTime(),
    build_duration_ms: sd.integer(),
    resources_originated_count: sd.integer(),
    resources_persisted_count: sd.integer(),
    resources_memoized_count: sd.integer(),
    running_average: sd.float(),
    running_average_big: sd.bigFloat(),
    resource_utilization: sd.floatArray(),
    build_performance_metrics: sd.floatArrayNullable(),
    notes: sd.varCharNullable(39),
    ...housekeepingAuditable.columns,
  });

  const publServerService = gm.autoIncPkTable("publ_server_service", {
    publ_server_service_id: keys.autoIncPrimaryKey(),
    service_started_at: sd.dateTime(),
    listen_host: sd.text(),
    listen_port: sd.integer(),
    publish_url: sd.text(),
    publ_build_event_id: publBuildEvent.references.publ_build_event_id(),
    ...housekeeping.columns,
  });

  const publServerStaticAccessLog = gm.autoIncPkTable(
    "publ_server_static_access_log",
    {
      publ_server_static_access_log_id: keys.autoIncPrimaryKey(),
      status: sd.integer(),
      asset_nature: sd.text(),
      location_href: sd.text(),
      filesys_target_path: sd.text(),
      filesys_target_symlink: sd.textNullable(),
      publ_server_service_id: publServerService.references
        .publ_server_service_id(),
      log: sd.jsonText(),
      ...housekeeping.columns,
    },
  );

  const publ_server_error_log_id = keys.autoIncPrimaryKey();
  const publServerErrorLog = gm.autoIncPkTable("publ_server_error_log", {
    publ_server_error_log_id,
    parent_publ_server_error_log_id: sd.selfRef(publ_server_error_log_id)
      .optional(),
    location_href: sd.text(),
    error_summary: sd.text(),
    host_identity: sd.jsonTextNullable(),
    host_meta: sd.jsonTextNullable(),
    host_baggage: sd.jsonbNullable(),
    publ_server_service_id: publServerService.references
      .publ_server_service_id(),
    ...housekeeping.columns,
  });

  return {
    governedModel: gm,
    publHost,
    publBuildEvent,
    publServerService,
    publServerStaticAccessLog,
    publServerErrorLog,
    publHostView,
    hostType,
    buildEventType,
  };
}

Deno.test("SQL Aide (SQLa) emit template", () => {
  const ss = syntheticSchema();
  const gts = ss.governedModel.templateState;
  const ls = gts.qualitySystemContent();

  // deno-fmt-ignore
  const DDL = SQLa.SQL(gts.ddlOptions)`
    -- Generated by unit test. DO NOT EDIT.
    -- Governance:
    -- * use 3rd normal form for tables
    -- * use views to wrap business logic
    -- * when denormalizing is required, use views (don't denormalize tables)
    -- * each table name MUST be singular (not plural) noun
    -- * each table MUST have a \`table_name\`_id primary key (typicalTableDefn will do this automatically)
    -- * each table MUST have \`created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\` column (typicalTableDefn will do this automatically)
    -- * if table's rows are mutable, it MUST have a \`updated_at TIMESTAMP\` column (not having an updated_at means it's immutable)
    -- * if table's rows are deleteable, it MUST have a \`deleted_at TIMESTAMP\` column for soft deletes (not having an deleted_at means it's immutable)

    ${ls.sqlTextLintSummary}

    ${ss.hostType}

    ${ss.publHost}
    ${gts.persistSQL(ss.publHost, "publ-host.sql")}

    ${ss.publHostView}

    ${ss.buildEventType}

    ${ss.publBuildEvent}

    ${ss.publServerService}

    ${ss.publServerStaticAccessLog}

    ${ss.publServerErrorLog}

    ${ss.publHost.insertDML({ publ_host_id: "test", host: "test", host_identity: "testHI", mutation_count: 0, host_type_code: ss.hostType.seedEnum.linux })}

    ${ss.publHost.select({ host_identity: "testHI"})}

    -- TypeScript numeric enum object entries as RDBMS rows
    ${ss.hostType.seedDML}

    -- TypeScript text enum object entries as RDBMS rows
    ${ss.buildEventType.seedDML}

    ${ls.sqlTmplEngineLintSummary}`;

  const ctx = gts.context();
  const syntheticSQL = DDL.SQL(ctx);
  if (DDL.stsOptions.sqlQualitySystemState?.lintedSqlText.lintIssues?.length) {
    console.dir(DDL.stsOptions.sqlQualitySystemState?.lintedSqlText.lintIssues);
  }
  ta.assertEquals(syntheticSQL, fixtureSQL);
  ta.assertEquals(
    0,
    DDL.stsOptions.sqlQualitySystemState?.lintedSqlText.lintIssues?.length,
  );
  ta.assertEquals(gts.tablesDeclared.size, 7);
  ta.assertEquals(gts.viewsDeclared.size, 1);
  ta.assertEquals(fixturePUML, gts.pumlERD(ctx).content);
});

// deno-fmt-ignore
const fixtureSQL = ws.unindentWhitespace(`
  -- Generated by unit test. DO NOT EDIT.
  -- Governance:
  -- * use 3rd normal form for tables
  -- * use views to wrap business logic
  -- * when denormalizing is required, use views (don't denormalize tables)
  -- * each table name MUST be singular (not plural) noun
  -- * each table MUST have a \`table_name\`_id primary key (typicalTableDefn will do this automatically)
  -- * each table MUST have \`created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\` column (typicalTableDefn will do this automatically)
  -- * if table's rows are mutable, it MUST have a \`updated_at TIMESTAMP\` column (not having an updated_at means it's immutable)
  -- * if table's rows are deleteable, it MUST have a \`deleted_at TIMESTAMP\` column for soft deletes (not having an deleted_at means it's immutable)

  -- no SQL lint issues (typicalSqlTextLintManager)

  CREATE TABLE IF NOT EXISTS "host_type" (
      "code" INTEGER PRIMARY KEY NOT NULL,
      "value" TEXT NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "publ_host" (
      "publ_host_id" TEXT PRIMARY KEY NOT NULL,
      "host" TEXT /* UNIQUE COLUMN */ NOT NULL,
      "host_identity" TEXT,
      "host_type_code" INTEGER NOT NULL,
      "mutation_count" INTEGER NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "created_by" TEXT DEFAULT 'UNKNOWN',
      FOREIGN KEY("host_type_code") REFERENCES "host_type"("code"),
      UNIQUE("host")
  );
  -- encountered persistence request for 1_publ-host.sql

  CREATE VIEW IF NOT EXISTS "publ_host_vw"("publ_host_id", "host", "host_identity", "host_type_code", "mutation_count", "created_at", "created_by") AS
      SELECT * FROM publ_host WHERE "host" = 'my_host';

  CREATE TABLE IF NOT EXISTS "build_event_type" (
      "code" TEXT PRIMARY KEY NOT NULL,
      "value" TEXT NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "publ_build_event" (
      "publ_build_event_id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "publ_host_id" TEXT NOT NULL,
      "build_event_type" TEXT NOT NULL,
      "iteration_index" INTEGER NOT NULL,
      "build_initiated_at" TIMESTAMP NOT NULL,
      "build_completed_at" TIMESTAMP NOT NULL,
      "build_duration_ms" INTEGER NOT NULL,
      "resources_originated_count" INTEGER NOT NULL,
      "resources_persisted_count" INTEGER NOT NULL,
      "resources_memoized_count" INTEGER NOT NULL,
      "running_average" REAL NOT NULL,
      "running_average_big" REAL NOT NULL,
      "resource_utilization" REAL[] NOT NULL,
      "build_performance_metrics" REAL[],
      "notes" VARCHAR(39),
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "created_by" TEXT DEFAULT 'UNKNOWN',
      "updated_at" TIMESTAMP,
      "updated_by" TEXT,
      "deleted_at" TIMESTAMP,
      "deleted_by" TEXT,
      "activity_log" TEXT,
      FOREIGN KEY("publ_host_id") REFERENCES "publ_host"("publ_host_id"),
      FOREIGN KEY("build_event_type") REFERENCES "build_event_type"("code")
  );

  CREATE TABLE IF NOT EXISTS "publ_server_service" (
      "publ_server_service_id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "service_started_at" TIMESTAMP NOT NULL,
      "listen_host" TEXT NOT NULL,
      "listen_port" INTEGER NOT NULL,
      "publish_url" TEXT NOT NULL,
      "publ_build_event_id" INTEGER NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "created_by" TEXT DEFAULT 'UNKNOWN',
      FOREIGN KEY("publ_build_event_id") REFERENCES "publ_build_event"("publ_build_event_id")
  );

  CREATE TABLE IF NOT EXISTS "publ_server_static_access_log" (
      "publ_server_static_access_log_id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "status" INTEGER NOT NULL,
      "asset_nature" TEXT NOT NULL,
      "location_href" TEXT NOT NULL,
      "filesys_target_path" TEXT NOT NULL,
      "filesys_target_symlink" TEXT,
      "publ_server_service_id" INTEGER NOT NULL,
      "log" TEXT NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "created_by" TEXT DEFAULT 'UNKNOWN',
      FOREIGN KEY("publ_server_service_id") REFERENCES "publ_server_service"("publ_server_service_id")
  );

  CREATE TABLE IF NOT EXISTS "publ_server_error_log" (
      "publ_server_error_log_id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "parent_publ_server_error_log_id" INTEGER,
      "location_href" TEXT NOT NULL,
      "error_summary" TEXT NOT NULL,
      "host_identity" TEXT,
      "host_meta" TEXT,
      "host_baggage" TEXT,
      "publ_server_service_id" INTEGER NOT NULL,
      "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "created_by" TEXT DEFAULT 'UNKNOWN',
      FOREIGN KEY("parent_publ_server_error_log_id") REFERENCES "publ_server_error_log"("publ_server_error_log_id"),
      FOREIGN KEY("publ_server_service_id") REFERENCES "publ_server_service"("publ_server_service_id")
  );

  INSERT INTO "publ_host" ("publ_host_id", "host", "host_identity", "host_type_code", "mutation_count", "created_by") VALUES ('test', 'test', 'testHI', 0, 0, NULL);

  SELECT "publ_host_id" FROM "publ_host" WHERE "host_identity" = 'testHI';

  -- TypeScript numeric enum object entries as RDBMS rows
  INSERT INTO "host_type" ("code", "value") VALUES (0, 'linux');
  INSERT INTO "host_type" ("code", "value") VALUES (1, 'windows');

  -- TypeScript text enum object entries as RDBMS rows
  INSERT INTO "build_event_type" ("code", "value") VALUES ('code1', 'value1');
  INSERT INTO "build_event_type" ("code", "value") VALUES ('code2', 'value2');

  -- no template engine lint issues (typicalSqlTextLintManager)`);

const fixturePUML = `@startuml IE
  hide circle
  skinparam linetype ortho
  skinparam roundcorner 20
  skinparam class {
    BackgroundColor White
    ArrowColor Silver
    BorderColor Silver
    FontColor Black
    FontSize 12
  }

  entity "host_type" as host_type {
    * **code**: INTEGER
    --
    * value: TEXT
      created_at: TIMESTAMP
  }

  entity "publ_host" as publ_host {
    * **publ_host_id**: TEXT
    --
    * host: TEXT
      host_identity: TEXT
    * host_type_code: INTEGER
    * mutation_count: INTEGER
      created_at: TIMESTAMP
      created_by: TEXT
  }

  entity "build_event_type" as build_event_type {
    * **code**: TEXT
    --
    * value: TEXT
      created_at: TIMESTAMP
  }

  entity "publ_build_event" as publ_build_event {
      **publ_build_event_id**: INTEGER
    --
    * publ_host_id: TEXT
    * build_event_type: TEXT
    * iteration_index: INTEGER
    * build_initiated_at: TIMESTAMP
    * build_completed_at: TIMESTAMP
    * build_duration_ms: INTEGER
    * resources_originated_count: INTEGER
    * resources_persisted_count: INTEGER
    * resources_memoized_count: INTEGER
    * running_average: REAL
    * running_average_big: REAL
    * resource_utilization: REAL[]
      build_performance_metrics: REAL[]
      notes: VARCHAR(39)
      created_at: TIMESTAMP
      created_by: TEXT
      updated_at: TIMESTAMP
      updated_by: TEXT
      deleted_at: TIMESTAMP
      deleted_by: TEXT
      activity_log: TEXT
  }

  entity "publ_server_service" as publ_server_service {
      **publ_server_service_id**: INTEGER
    --
    * service_started_at: TIMESTAMP
    * listen_host: TEXT
    * listen_port: INTEGER
    * publish_url: TEXT
    * publ_build_event_id: INTEGER
      created_at: TIMESTAMP
      created_by: TEXT
  }

  entity "publ_server_static_access_log" as publ_server_static_access_log {
      **publ_server_static_access_log_id**: INTEGER
    --
    * status: INTEGER
    * asset_nature: TEXT
    * location_href: TEXT
    * filesys_target_path: TEXT
      filesys_target_symlink: TEXT
    * publ_server_service_id: INTEGER
    * log: TEXT
      created_at: TIMESTAMP
      created_by: TEXT
  }

  entity "publ_server_error_log" as publ_server_error_log {
      **publ_server_error_log_id**: INTEGER
    --
      parent_publ_server_error_log_id: INTEGER
    * location_href: TEXT
    * error_summary: TEXT
      host_identity: TEXT
      host_meta: TEXT
      host_baggage: TEXT
    * publ_server_service_id: INTEGER
      created_at: TIMESTAMP
      created_by: TEXT
  }

  publ_host |o..o{ publ_build_event
  build_event_type |o..o{ publ_build_event
  publ_build_event |o..o{ publ_server_service
  publ_server_service |o..o{ publ_server_static_access_log
  publ_server_error_log |o..o{ publ_server_error_log
  publ_server_service |o..o{ publ_server_error_log
@enduml`;
