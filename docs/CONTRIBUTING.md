# Contributing

We welcome all contributions. Big or small, every change matters.

To keep things simple and to maintain quality, please follow these guidelines.

## Before You Begin

- Please read our `README.md` and `ACKNOWLEDGEMENTS` to understand our work.
- Familiarize yourself with our directory structure. Each file is hand-crafted.
- Make sure that you are using a Node.js version supported by `@stacks/clarinet-sdk`.
- Install [pnpm](https://pnpm.io/installation), then run `pnpm install`.

## How to Contribute

1. **Open an issue:**
   If you find a bug or want to suggest an improvement, open an issue.
   Describe the problem and proposed changes in simple terms.

2. **Create a fork and branch:**
   Work in a dedicated branch. Use short, clear names:

   ```
   git checkout -b my-fix
   ```

3. **Maintain code style:**
   We value simple, readable code. Follow our coding style:
   - Keep line length <= 79 chars.
   - Use simple American English.
   - Keep comments brief and clear.
   - Keep logic small and focused.

   Example code comment:

   ```js
   // Good: Explains why, offering crucial context.
   // Bad: Focuses on how or adds unnecessary verbosity.
   ```

4. **Write tests:**
   Test your changes. Add or update tests in `*.tests.ts` files.
   Run tests:

   ```
   pnpm test
   ```

   Make sure all tests pass before sending your changes.

5. **Use clear commit messages:**
   - Summarize changes in 79 chars or fewer.
   - Use simple language.
   - Example commit message:
     ```
     Fix off-by-one error in property-based test
     ```

   Commit messages should be short and clear.

6. **Open a pull request (PR) targeting the `master` branch:**
   Keep it small and focused. Explain what and why.
   Example PR description:

   ```
   This PR fixes a minor off-by-one error in the property-based tests.
   The fuzzing process now produces the expected results.
   ```

7. **Be patient and open-minded:**
   Reviewers may ask questions or suggest changes.
   We believe in polite and constructive discussion.

## Tips for a Great Contribution

- Keep your changes small and do one thing at a time.
- Make sure your PR is easy to review.
  Clear code and tests ease the review process.
- Provide context for your changes. Explain why they are needed.
- Don't rush. Take time to polish your work.

## Thank You

We appreciate your interest in improving Rendezvous (`rv`).
Your contributions help keep `rv` robust, helpful, and accessible to everyone.

---

_This CONTRIBUTING guide is crafted with inspiration from the following:_

- [AutoFixture CONTRIBUTING.md](https://github.com/AutoFixture/AutoFixture/blob/master/CONTRIBUTING.md) by AutoFixture contributors
- [Hedgehog STYLE_GUIDE.md](https://github.com/hedgehogqa/haskell-hedgehog/blob/master/STYLE_GUIDE.md) by Hedgehog contributors
- [10 Tips for Better Pull Requests](https://blog.ploeh.dk/2015/01/15/10-tips-for-better-pull-requests/) by Mark Seemann (ploeh)
- [The Importance of Comments](https://ayende.com/blog/163297/the-importance-of-comments) by Oren Eini (Ayende Rahien)

_(These references also highlight some of our roots and past influences.)_
