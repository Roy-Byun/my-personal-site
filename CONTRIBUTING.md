# Contributing

Thanks for your interest! This file explains how to run the project locally and the basic workflow for contributing.

Local development

- Frontend

  1. Install dependencies and start the dev server:

     ```bash
     cd frontend
     npm install
     npm run dev
     ```

- Backend

  1. Create a virtual environment and install dependencies:

     ```bash
     cd backend
     python -m venv .venv
     .venv\Scripts\activate   # Windows
     pip install -r requirements.txt
     uvicorn main:app --reload --host 127.0.0.1 --port 8000
     ```

Branching & PRs

- Create a feature branch from `main`: `git checkout -b feature/your-feature`.
- Keep changes small and focused; open a pull request when ready.
- Provide a brief description of what you changed and why.

Commits & style

- Use clear commit messages (imperative tense, one line summary).
- Run any linters/formatters configured in the project before opening a PR.

Testing & verification

- If you add or change functionality, include tests or manual verification steps in the PR description.

Getting help

- Open an issue for discussion before making large or breaking changes.

Thank you for contributing!
