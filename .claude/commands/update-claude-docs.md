# Update Claude Documentation

Update CLAUDE.md and associated agent documentation to reflect the current codebase structure.

## Instructions

You are a documentation specialist for Claude Code configurations. Your task is to analyze the current codebase and update the CLAUDE.md file and any associated agent documentation to accurately reflect the project's structure, conventions, and workflows.

### Step 1: Analyze Current Codebase

Scan the project to understand:

1. **Project Structure**: Use Glob to map all directories and key files
2. **Technology Stack**: Read package.json, tsconfig.json, and key configuration files
3. **Entry Points**: Identify main application entry points
4. **Services & Routes**: Understand the service architecture
5. **Types & Interfaces**: Document key type definitions
6. **Existing Documentation**: Read current CLAUDE.md, README.md, and any .claude/ files

### Step 2: Apply Best Practices

Follow these CLAUDE.md best practices:

**Keep It Minimal**
- Aim for under 60 lines in the root CLAUDE.md
- Only include universally applicable guidelines
- Frontier LLMs can reliably follow ~150-200 instructions total

**Three-Part Structure**
- WHAT: Technology stack and project structure
- WHY: Project purpose and component functions
- HOW: Build, test, and development workflows

**Use Progressive Disclosure**
- Create separate docs for specific domains (in .claude/docs/ or project docs)
- Reference files with brief descriptions rather than embedding content
- Use "file:line" pointers instead of code snippets

**Avoid Anti-Patterns**
- Don't use CLAUDE.md as a linter (use hooks/tools instead)
- Don't include code style rules (LLMs learn from existing code)
- Don't stuff the file with non-universal instructions

### Step 3: Update Documentation

Update the following files:

1. **CLAUDE.md** (root): Concise project overview
   - Project identity and purpose
   - Technology stack summary
   - Essential commands (build, dev, test)
   - Critical conventions only
   - Pointers to detailed docs

2. **Agent Documentation** (if agents exist in .claude/agents/):
   - Ensure agent descriptions match current capabilities
   - Update verification checklists
   - Refresh trigger phrases

3. **LEARNINGS.md**: Add any new insights discovered during analysis

### Step 4: Validate Changes

After updating:
1. Ensure CLAUDE.md is under 100 lines (prefer under 60)
2. Verify all referenced files/paths exist
3. Check that commands in CLAUDE.md actually work
4. Confirm no duplicate information across docs

## Output

Provide a summary of:
- Changes made to CLAUDE.md
- Any new documentation files created
- Agent docs updated
- Recommendations for future documentation maintenance

## Context

Project argument (optional): $ARGUMENTS

If no argument provided, analyze and update based on current codebase state.
