# Installation

This chapter covers how to install Rendezvous and set up your environment for effective Clarity contract testing.

## What's Inside

[Prerequisites](#prerequisites)

[Standard Installation](#standard-installation)

[Global Installation](#global-installation)

[Development/Contribution Installation](#developmentcontribution-installation)

[Verifying Your Installation](#verifying-your-installation)

[Project Setup](#project-setup)

[Troubleshooting Installation Issues](#troubleshooting-installation-issues)

- [Common Issues and Solutions](#common-issues-and-solutions)

[Uninstalling Rendezvous](#uninstalling-rendezvous)

- [Removing a Local Installation](#removing-a-local-installation)
- [Removing a Global Installation](#removing-a-global-installation)
- [Removing a Development Installation](#removing-a-development-installation)

[Next Steps](#next-steps)

---

## Prerequisites

Before installing Rendezvous, ensure you have the following prerequisites:

- **Node.js**: Rendezvous requires Node.js 22.12 or later and is tested on Node.js 22 and 24. Other versions may work but are untested.
- **Clarinet**: You need a Clarinet project to use Rendezvous. If you don't have Clarinet installed, follow the [official Clarinet installation guide](https://github.com/stx-labs/clarinet).

## Standard Installation

To install Rendezvous as a dependency in your project, use npm:

```bash
npm install @stacks/rendezvous
```

This will add Rendezvous to your project's `node_modules` and update your `package.json`.

## Global Installation

If you prefer to install Rendezvous globally so it's available across all your projects, use:

```bash
npm install -g @stacks/rendezvous
```

With a global installation, you can run the `rv` command from any directory without prefixing it with `npx`.

## Development/Contribution Installation

If you want to contribute to Rendezvous or run it from source, you need
[pnpm](https://pnpm.io/installation). The repository pins its pnpm version in
`package.json`.

1. Clone the repository:

   ```bash
   git clone https://github.com/stx-labs/rendezvous.git
   ```

2. Navigate to the project directory:

   ```bash
   cd rendezvous
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Build the project:

   ```bash
   pnpm run build
   ```

5. Link the package globally (optional):
   ```bash
   npm install -g .
   ```

## Verifying Your Installation

After installing Rendezvous, verify that it's working correctly:

```bash
npx rv --help
```

Or if installed globally:

```bash
rv --help
```

You should see the current version of Rendezvous displayed.

## Project Setup

For Rendezvous to work properly, your Clarinet project should have the following structure:

```
my-project/
├── Clarinet.toml
├── contracts/
│   └── my-contract.clar       # Your contract with tests inside.
└── settings/
    └── Devnet.toml
```

> Key points to note:
>
> 1.  Rendezvous functions (invariants and property-based tests) are written directly inside the contract file, annotated with `#[env(simnet)]` for conditional deployment.
> 2.  A valid `Clarinet.toml` file must exist at the project root.

## Troubleshooting Installation Issues

### Common Issues and Solutions

**Node.js Version Conflicts**

If you encounter errors related to Node.js versions, ensure you're using a supported version (22.12 or later).

```bash
node --version
```

**Package Not Found**

If the `rv` command isn't found after installation:

1. For local installation, use `npx rv` instead of just `rv`.
2. For global installation, ensure your npm global binaries directory is in your PATH.

**Clarinet Project Not Recognized**

If Rendezvous cannot find your Clarinet project:

1. Ensure you're running the command from the correct directory.
2. Verify that your `Clarinet.toml` file exists and is properly formatted.
3. Check that your contract files are correctly named and located and pass Simnet type-checking.

**Permission Issues**

If you encounter permission errors when installing globally, consider using a solution like [nvm](https://github.com/nvm-sh/nvm) to manage Node.js installations without requiring elevated permissions.

## Uninstalling Rendezvous

If you need to uninstall Rendezvous, the process depends on how you initially installed it.

### Removing a Local Installation

To remove Rendezvous from a specific project:

```bash
npm uninstall @stacks/rendezvous
```

This will remove the package from your project's `node_modules` directory and update your `package.json`.

### Removing a Global Installation

To remove a globally installed version of Rendezvous:

```bash
npm uninstall -g @stacks/rendezvous
```

### Removing a Development Installation

If you installed from source:

1. If you linked the package globally, unlink it first:

   ```bash
   npm uninstall -g @stacks/rendezvous
   ```

2. You can then remove the cloned repository directory:
   ```bash
   rm -rf path/to/rendezvous
   ```

## Next Steps

Now that you have Rendezvous installed, you're ready to start testing your Clarity contracts. In the next chapter, we'll cover how to use Rendezvous effectively with detailed usage examples.

If you'd rather drive the testing loop yourself from TypeScript — composing custom fast-check properties on top of Rendezvous's argument generation — see the [Library API](chapter_9.md) chapter.
