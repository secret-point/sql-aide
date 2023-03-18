import { zod as z } from "../deps.ts";
import * as tmpl from "../sql.ts";
import * as safety from "../lib/universal/safety.ts";
import * as l from "../lint.ts";

// deno-lint-ignore no-explicit-any
type Any = any; // make it easy on linter

export type SqlDomain<
  ZTA extends z.ZodTypeAny,
  Context extends tmpl.SqlEmitContext,
  DomainIdentity extends string,
> = tmpl.SqlSymbolSupplier<Context> & {
  readonly isSqlDomain: true;
  readonly identity: DomainIdentity;
  readonly isNullable: () => boolean;
  readonly sqlDataType: (
    purpose:
      | "create table column"
      | "stored routine arg"
      | "stored function returns scalar"
      | "stored function returns table column"
      | "type field"
      | "table foreign key ref"
      | "diagram"
      | "PostgreSQL domain",
  ) => tmpl.SqlTextSupplier<Context>;
  readonly sqlDefaultValue?: (
    purpose: "create table column" | "stored routine arg",
  ) => tmpl.SqlTextSupplier<Context>;
  readonly sqlDmlTransformInsertableValue?: (
    supplied: ZTA | undefined,
  ) => ZTA;
  readonly sqlPartial?: (
    destination:
      | "create table, full column defn"
      | "create table, column defn decorators"
      | "create table, after all column definitions",
  ) => tmpl.SqlTextSupplier<Context>[] | undefined;
};

export type SqlDomainPreparer<
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
> = <
  ZodType extends z.ZodTypeAny,
  Identity extends DomainsIdentity,
>(
  zodType: ZodType,
  init?: { identity: Identity },
) => SqlDomain<ZodType, Context, Identity>;

export type SqlDomainSupplier<
  ZodType extends z.ZodTypeAny,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
> = { readonly sqlDomain: SqlDomain<ZodType, Context, DomainsIdentity> };

export type SqlCustomDomainSupplier<
  Enrich extends Record<string, unknown>,
  ZodType extends z.ZodTypeAny,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
> = {
  readonly sqlDomain: SqlDomain<ZodType, Context, DomainsIdentity> & Enrich;
};

export type ZodTypeSqlDomainSupplier<
  ZodType extends z.ZodTypeAny,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
> = ZodType & SqlDomainSupplier<ZodType, DomainsIdentity, Context>;

export function zodTypeAnySqlDomainFactory<
  ZodType extends z.ZodTypeAny,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
>() {
  const SQL_DOMAIN_NOT_IN_COLLECTION = "SQL_DOMAIN_NOT_IN_COLLECTION" as const;

  const isSqlDomain = safety.typeGuard<
    SqlDomain<ZodType, Context, DomainsIdentity>
  >("isSqlDomain", "sqlDataType");

  const isSqlDomainSupplier = safety.typeGuard<
    SqlDomainSupplier<ZodType, DomainsIdentity, Context>
  >("sqlDomain");

  const defaults = <Identity extends string>(
    zodType: ZodType,
    init?: {
      readonly identity?: Identity;
      readonly isOptional?: boolean;
      readonly parents?: z.ZodTypeAny[];
    },
  ) => {
    const lintIssues: l.SqlLintIssueSupplier[] = [];
    const defaults:
      & Pick<
        SqlDomain<Any, Context, Identity>,
        "identity" | "isSqlDomain" | "sqlSymbol" | "isNullable"
      >
      & l.SqlLintIssuesSupplier = {
        isSqlDomain: true as true, // must not be a boolean but `true`
        identity: (init?.identity ?? SQL_DOMAIN_NOT_IN_COLLECTION) as Identity,
        isNullable: () =>
          init?.isOptional || zodType.isOptional() || zodType.isNullable(),
        sqlSymbol: (ctx: Context) =>
          ctx.sqlNamingStrategy(ctx, { quoteIdentifiers: true }).domainName(
            init?.identity ?? SQL_DOMAIN_NOT_IN_COLLECTION,
          ),
        lintIssues,
        registerLintIssue: (...slis: l.SqlLintIssueSupplier[]) => {
          lintIssues.push(...slis);
        },
      };
    return defaults;
  };

  return {
    SQL_DOMAIN_NOT_IN_COLLECTION,
    isSqlDomain,
    isSqlDomainSupplier,
    defaults,
  };
}

export function zodStringSqlDomainFactory<
  ZodType extends z.ZodType<string, z.ZodStringDef>,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
>() {
  const ztaSDF = zodTypeAnySqlDomainFactory<
    ZodType,
    DomainsIdentity,
    Context
  >();
  return {
    ...ztaSDF,
    string: <Identity extends string>(
      zodType: ZodType,
      init?: {
        readonly identity?: Identity;
        readonly isOptional?: boolean;
        readonly parents?: z.ZodTypeAny[];
      },
    ) => {
      return {
        ...ztaSDF.defaults<Identity>(zodType, init),
        sqlDataType: () => ({ SQL: () => `TEXT` }),
        parents: init?.parents,
      };
    },
  };
}

export function zodNumberSqlDomainFactory<
  ZodType extends z.ZodType<number, z.ZodStringDef>,
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
>() {
  const ztaSDF = zodTypeAnySqlDomainFactory<
    ZodType,
    DomainsIdentity,
    Context
  >();
  return {
    ...ztaSDF,
    number: <Identity extends string>(
      zodType: ZodType,
      init?: {
        readonly identity?: Identity;
        readonly isOptional?: boolean;
        readonly parents?: z.ZodTypeAny[];
      },
    ) => {
      return {
        ...ztaSDF.defaults<Identity>(zodType, init),
        sqlDataType: () => ({ SQL: () => `INTEGER` }),
      };
    },
  };
}

export function zodTypeSqlDomainFactory<
  DomainsIdentity extends string,
  Context extends tmpl.SqlEmitContext,
>() {
  const SQL_DOMAIN_HAS_NO_IDENTITY_FROM_SHAPE =
    "SQL_DOMAIN_HAS_NO_IDENTITY_FROM_SHAPE";

  const anySDF = zodTypeAnySqlDomainFactory<Any, DomainsIdentity, Context>();

  const stringSDF = zodStringSqlDomainFactory<
    z.ZodType<string, z.ZodStringDef, string>,
    DomainsIdentity,
    Context
  >();

  const numberSDF = zodNumberSqlDomainFactory<
    z.ZodType<number, z.ZodStringDef, number>,
    DomainsIdentity,
    Context
  >();

  const detachFrom = <ZodType extends z.ZodTypeAny>(zodType: ZodType): void => {
    delete (zodType as Any)["sqlDomain"];

    const zodDef = zodType._def;
    switch (zodDef.typeName) {
      case z.ZodFirstPartyTypeKind.ZodOptional: {
        return detachFrom(zodType._def.innerType);
      }

      case z.ZodFirstPartyTypeKind.ZodDefault: {
        return detachFrom(zodType._def.innerType);
      }
    }
  };

  const from = <
    Identity extends string,
    ZodType extends z.ZodTypeAny,
  >(
    zodType: ZodType,
    init?: {
      readonly identity?: Identity;
      readonly isOptional?: boolean;
      readonly parents?: z.ZodTypeAny[];
    },
  ): SqlDomain<ZodType, Context, Identity> => {
    const zodDef = zodType._def;
    switch (zodDef.typeName) {
      case z.ZodFirstPartyTypeKind.ZodOptional: {
        return from(zodType._def.innerType, {
          ...init,
          isOptional: true,
          parents: init?.parents ? [...init.parents, zodType] : [zodType],
        });
      }

      case z.ZodFirstPartyTypeKind.ZodDefault: {
        return from(zodType._def.innerType, {
          ...init,
          parents: init?.parents ? [...init.parents, zodType] : [zodType],
        });
      }
    }

    switch (zodDef.typeName) {
      case z.ZodFirstPartyTypeKind.ZodString: {
        return stringSDF.string(zodType, init);
      }

      case z.ZodFirstPartyTypeKind.ZodNumber: {
        return numberSDF.number(zodType, init);
      }

      default:
        throw new Error(
          `Unable to map Zod type ${zodDef.typeName} to SQL domain`,
        );
    }
  };

  const cacheableFrom = <
    Identity extends string,
    ZodType extends z.ZodTypeAny,
  >(
    zodType: ZodType,
    init?: {
      readonly identity?: Identity;
      readonly isOptional?: boolean;
      readonly parents?: z.ZodTypeAny[];
      readonly forceCreate?: boolean;
    },
  ): SqlDomain<ZodType, Context, Identity> => {
    // if a sqlDomain is already attached to a ZodType use it as-is;
    if (anySDF.isSqlDomainSupplier(zodType)) {
      if (!init?.forceCreate) {
        const proxied = (zodType as Any).sqlDomain as SqlDomain<
          ZodType,
          Context,
          Identity
        >;
        if (proxied.identity == anySDF.SQL_DOMAIN_NOT_IN_COLLECTION) {
          (proxied.identity as string) = init?.identity ??
            SQL_DOMAIN_HAS_NO_IDENTITY_FROM_SHAPE;
        }
        return proxied;
      } else {
        detachFrom(zodType);
      }
    }

    return from(zodType, init);
  };

  return {
    SQL_DOMAIN_HAS_NO_IDENTITY_FROM_SHAPE,
    anySDF,
    stringSDF,
    numberSDF,
    detachFrom,
    from,
    cacheableFrom,
  };
}
