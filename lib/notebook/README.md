# SQL Aide Notebook (SQLa Notebook or SQL Notebook)

SQL Aide Notebook is a data operations notebook library built for
TypeScript-based SQL generator workflows. It helps you orchestrate SQL
generation tasks such as acquiring source data and assembling SQL using an
Aspect-oriented Programming (AOP) style using dependency injections.

## Concepts

- Notebooks are TypeScript classes and form _documents_ comprised of _cells_.
  Terminology is similar to Jupyter and other _notebooks_.
- Cells are class methods (functions) and form the building blocks of Notebooks.
- Kernels are the "engines" that process notebooks and cells.

## Core Capabilities

- Each notebook is defined as a set of type-safe TypeScript modules that can
  operate independently as a CLI or as a library to be included by other
  notebooks. Notebook cells can operate outside of SQLa Notebook or as part of
  the framework. It's a design goal to ensure that this library does not become
  a dependency and that there's no vendor lock-in. The way we accomplish this is
  to allow a Notebook to be a plain TypeScript Class.
- Every Notebook Cell should be type-safe on the incoming and outgoing sides.
  Creating maintainable and decoupled code is a design goal and type-safety
  helps achieve that goal.
- Each Notebook Cell should have explicit dependencies that are easy to follow.
  Ease of debugging is a design goal so implicit dependencies should be reduced.
- Every Notebook Cell should be independently unit testable. Creating
  maintainable and decoupled code is a design goal and unit testing helps
  achieve that goal.
- Notebook Cells should be stateless whenever possible but if they are stateful
  they should allow their state to be stored using Open Telememtry traces, logs,
  and metrics plus be storage independent. It is a design goal to elminate state
  management dependencies by storing state in files, databases, or in memory.
- Notebook Cells must be able to store their own Quality System (documentation)
  content such as descriptions, lineage, stewardship, etc.

## Notebook Infrastructure Status

- [x] Notebook _core_ has no external dependencies
- [ ] Notebook uses [Effect](https://www.effect.website/docs/quickstart)
      ([GitHub](https://github.com/Effect-TS/effect)) for more complex workflows
- [ ] Notebook uses [ts-pattern](https://github.com/gvergnaud/ts-pattern) for
      exhaustive Pattern Matching library, with smart type inference
- [ ] Notebook uses Prolog consults for logic programming (and graph resolution)

## Kernel Status

SQL Notebook supports multiple kernel types, depending on Notebook needs.

- [x] Each notebook can be executed as a standalone Deno script
- [x] Each notebook can be scheduled using `cron` or other external utilities
- [x] Notebook execution has complete observability of all initialization,
      execution of cells, errors, and finalization through EventEmitter (`EE`)
      pattern; the EE-based approach allows workflow state or other custom
      workflow behaviors to be externalized.
  - [ ] EventEmitter allows unlimited typed listeners for each Notebook Cell
- [ ] Each notebook can be executed as a daemon/service
  - [ ] Can be initiated via a webhook called from an external `poke`
  - [ ] Can have a built-in scheduler via `croner` or similar
  - [ ] Can be executed via a _sensor_, like a file watcher or S3 watcher check
        an API regularly, etc..
- [ ] The Kernel can manage secrets outside of the notebook instances so that
      sensitive values and data are not seen by all developers; allow the
      secrets to managed in a type-safe way using Zod schemas
- [ ] Notebooks (or perhaps even _steps_) can be run in parallel as web workers
- [ ] Notebooks can be executed in a container or serverless environment
- [ ] Notebooks can be executed by regstering them in a cloud-based Kernel
      similar to [Inngest](https://github.com/inngest/inngest)

### Task-based Engine

- [x] Task-based Kernel treats each function property in a class as a
      workNotebook Cell. This is similar to how Apache Airflow works.

### Asset-based Engine

- [ ] Asset-based Kernel treats each function property in a class as an asset
      preparation function. This is similar to how Dagster works.

## Notebook Class Status

- [x] Each notebook is a TypeScript class
  - [x] Notebook classes do not not require any base classes or inheritence
        (though does support inheritable workflows).
  - [ ] Notebook classes can use TypeScript imports and support dependencies at
        the notebook level not just at the cell level; use
        `lib/universal/graph.ts` to create DAGs which connect multiple flows
        together.
  - [ ] Notebook classes can be unit tested independently of the Notebook
        framework
  - [ ] Notebook runs should be able to be "dry-runnable" so it will just
        "document" what it will do instead of actually running the cells
  - [ ] Notebook runs should be able to report their execution status, progress,
        etc. (`verbose` mode) as Open Telemetry traces, logs, and metrics
- [x] Each Notebook Cell is a _synchronous_ or _asynchronous_ class method.
- [x] Each Notebook Cell may have one or more decorators that can specify
      aspects.
- [x] Each notebook can have one or more _initialization_ methods declared by
      decorators; initialization can also occur in notebook class constructor
      but since constructors cannot be asynchronous you can use decorated async
      methods when required
- [x] Each Notebook Cell class method is called in linear order unless it has a
      dependency decorator. If there are any dependencies the notebook will
      become a DAG that is toplogically sorted and executed.
- [x] Each Notebook Cell has a common set of arguments
  - [x] The current notebook state and cell context is the first argument.
  - [x] The previous cell's result (either an Error or its `return` statement
        value) is the second argument
- [x] Each notebook can one or more finalization methods delcared by decorators.
- [ ] Each Notebook Cell can be a shell command like in
      [TShellOut](https://github.com/linkdd/tshellout) _pipes_
- [ ] Each Notebook Cell can request value of Environment variables to be
      injected as function arguments or available in the stepCtx object.
- [ ] Each Notebook Cell can provide decorator to specify what happens on error
  - [ ] Notebook Cells can specify a number of retries and time between retry
        before failing
  - [ ] Supply a different result (maybe a partial result) if retries fail
  - [ ] Allow Notebook Cells to be skipped based on some condition
- [ ] Notebook instance property decorators can inject values from Engine
  - [ ] Each Notebook Cell can specific asset dependencies that can be loaded
        and memoized before the cell is executed (`dependsOnAsset` which can
        accept a URL, function, filename, etc.)
  - [ ] Notebook initialization can inject database connections (with pooling)
        and store them as instance properties
  - [ ] Notebook initialization can inject files or content being watched
- [ ] Each Notebook Cell can optionally request memoization of its results
      through a decorator.
- [ ] Notebook Cells already store results as part of `runContext.stepsExecuted`
      but we should have standard decorators to push results into S3, store them
      in a file, etc. as well
- [ ] Each Notebook Cell can optionally inject arguments into function call
  - [ ] Each Notebook Cell can optionally inject database connections (with
        pooling) as a parameter
  - [ ] Each Notebook Cell can optionally inject files or content being watched
- [ ] Each notebook as a whole can specify a timeouts to abort long-running
      flows
- [ ] Each Notebook Cell can provide decorator to specify timeouts to abort
      long-running cells
- [ ] Each Notebook Cell can provide an interruption decorator to specify
      preconditions.
- [ ] Each Notebook Cell can operate in a container similar to
      [Snakemake](https://snakemake.github.io/) (consider
      [Kubevirt](https://www.cncf.io/blog/2023/07/11/kubevirt-v1-0-has-landed/))
      when containers need to be run in parallel or be more scalable

## Notebook Quality System

- [ ] Notebook execution should have options for injecting synthetic or mock
      data or provide limited (e.g. first N rows instead of all rows) data for
      testing flows.