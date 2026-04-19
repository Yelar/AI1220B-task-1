# Meeting Log - Collaborative Document Editor with AI Writing Assistant

This document records team discussions, decisions, challenges, and progress throughout the development of the system.

---

## Team Members & Roles

- Person 1 — Frontend
  - Next.js UI, editor interface, AI panel, presence UI

- Person 2 — Backend/Data
  - FastAPI API, SQLite database, user management, permissions, versioning, testing

- Person 3 — AI/Collaboration
  - LM Studio integration, AI endpoints, WebSocket collaboration

---

## Meeting 1 — Project Kickoff

**Date:** March 2  
**Duration:** ~1 hour  

### Agenda
- Understand assignment requirements
- Define system scope
- Assign responsibilities

### Discussion
- Reviewed assignment requirements including real-time collaboration, AI assistant, document lifecycle, and user roles
- Identified key features:
  - Real-time editing
  - AI-assisted writing
  - Document versioning
  - Role-based access control

### Decisions
- Use Next.js for frontend
- Use FastAPI for backend
- Use SQLite for local persistence
- Use LM Studio for local AI
- Adopt a monorepo structure

### Task Allocation
- Frontend → UI and editor
- Backend → API, database, permissions
- AI → LM Studio integration and WebSocket

---

## Meeting 2 — Requirements & Architecture

**Date:** March 5  
**Duration:** ~1 hour  

### Agenda
- Define requirements
- Design architecture
- Plan system modules

### Discussion
- Defined functional requirements:
  - real-time collaboration
  - AI assistant
  - document versioning
  - role-based access control
- Created C4 architecture diagrams
- Discussed backend structure (routers, services, database)

### Key Design Decisions
- Use REST APIs for CRUD and AI
- Use WebSocket for collaboration
- Use local-first architecture (no external dependencies)
- AI suggestions should be non-destructive

### Outcome
- Completed architecture design
- Finalized API structure

---

## Meeting 3 — Backend Implementation Progress

**Date:** March 12  
**Duration:** ~1 hour  

### Agenda
- Implement backend features
- Review progress

### Discussion
- Implemented:
  - Document CRUD endpoints
  - Version listing
  - AI endpoints
- Designed database schema:
  - Document
  - DocumentVersion
  - AIInteraction

### Issues Encountered
- Uncertainty around how to implement user roles
- Needed to align backend with assignment requirement for permissions

### Decisions
- Introduce:
  - User model
  - DocumentPermission model
- Implement roles:
  - owner, editor, commenter, viewer

### Next Tasks
- Backend: implement permissions and version revert
- AI: improve LM Studio handling
- Frontend: connect to backend

---

## Meeting 4 — Permissions & Versioning

**Date:** March 18  
**Duration:** ~1 hour  

### Agenda
- Implement access control
- Add versioning features

### Discussion
- Implemented role-based permissions with API-level enforcement
- Added version creation and version revert functionality

### Issues Encountered
- Defining correct permissions for each role
- Ensuring version revert does not overwrite history

### Decisions
- Owner has full access, including revert
- Editor can edit and invoke AI
- Commenter and viewer have restricted access

### Outcome
- Backend now supports full document lifecycle

---

## Meeting 5 — Testing & Debugging

**Date:** March 25  
**Duration:** ~1 hour  

### Agenda
- Add backend tests
- Fix errors

### Discussion
- Added pytest-based tests:
  - CRUD operations
  - permissions
  - versioning
- Implemented test database setup

### Issues Encountered
- SQLite errors:
  - readonly database issues
  - test database conflicts (especially with OneDrive paths)
- Environment mismatch issues (virtual environment vs system Python)

### Solutions
- Switched to an isolated test database
- Used dependency override for database sessions
- Ensured all tests run independently

### Outcome
- All backend tests passing
- System stable

---

## Meeting 6 — Integration & Finalization

**Date:** April 1 
**Duration:** ~1 hour  

### Agenda
- Final integration
- Prepare demo and presentation

### Discussion
- Verified backend endpoints using Swagger
- Confirmed:
  - user roles are enforced
  - versioning works correctly
  - API contracts match the report
- Planned demo flow:
  - create document
  - edit content
  - create version
  - revert version
  - AI request

### Improvements Identified
- Improve WebSocket collaboration logic
- Add better UI for permissions
- Enhance AI suggestion UX

### Final Task Assignment
- Frontend:
  - complete editor UI
  - integrate API
- Backend:
  - finalize tests
  - ensure API stability
- AI:
  - refine prompt handling
  - improve error responses

---

## Meeting 7 — Demo Recording, Presentation, and Submission Preparation

**Date:** April 2
**Duration:** ~1 hour  

### Agenda
- Record demo video
- Finalize presentation slides
- Review and align report with implementation
- Prepare repository for submission

### Discussion
- Planned and recorded the proof-of-concept demo showing:
  - document creation and editing
  - version creation and revert
  - role-based permission enforcement
  - AI request workflow
- Finalized presentation structure:
  - team responsibilities
  - architectural design decisions
  - system demonstration
- Reviewed the report to ensure consistency with implementation:
  - updated API contracts
  - aligned data model with actual code (permissions, users)
  - removed inconsistencies (e.g., unused global role field)

### Issues Encountered
- Ensuring the demo runs smoothly without errors
- Synchronizing frontend and backend behavior during recording
- Aligning report descriptions with final implementation details

### Decisions
- Keep the demo focused on core features to avoid instability
- Prioritize clarity and correctness over adding extra features
- Ensure all documentation reflects the implemented system accurately

### Final Tasks Completed
- Recorded demo video
- Finalized slides for presentation
- Updated report and diagrams
- Cleaned and organized repository (README, structure, instructions)

### Outcome
- Project is fully prepared for submission
- All components (code, report, demo, presentation) are consistent and complete

