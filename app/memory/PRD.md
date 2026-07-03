# MCP Public Portal - Product Requirements Document

## Original Problem Statement
Build a customer-facing MongoDB training portal called MCP Public Portal. Customers log in with their organization details and a validated MongoDB SPOC email, then view:
- Training course catalog (left panel, slide-style details)
- Monthly training calendar (only batches accepting nominations)
- Live seat availability

This is a view-only portal. No nomination, booking, or registration flow.

## Architecture

### Tech Stack
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Motor (async MongoDB)
- **Frontend**: React 19, React Router, date-fns, Tailwind CSS, Lucide icons
- **Database**: MongoDB Atlas (mcp-forge database)
- **Auth**: JWT tokens in httpOnly cookies

### MongoDB Collections
- `spocDetail` - SPOC email validation (read-only)
- `batches` - Training batch data (read-only)
- `customer_logins` - Login audit trail (write-only)

### API Endpoints
- `POST /api/auth/login` - Login with org details + SPOC email validation
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/me` - Get current user info
- `GET /api/courses` - Get course catalog (4 courses with slides)
- `GET /api/batches` - Get batches with filters (status, location, track)
- `GET /api/sse/batches` - Server-Sent Events stream for live updates

## User Persona
- **Primary**: Enterprise customer SPOCs (Single Points of Contact) representing organizations interested in MongoDB training
- **Access**: Validated via MongoDB SPOC email in spocDetail collection

## Core Requirements (Static)
1. SPOC email validation against MongoDB collection
2. View-only portal (no booking/registration)
3. Display 4 MongoDB training courses with detailed slides
4. Monthly calendar showing batches with status "Accepting Nominations"
5. Live seat availability with color coding (green/yellow/red)
6. Location and track filters
7. Audit trail in customer_logins collection
8. MongoDB professional dark theme

## What's Been Implemented (Feb 2026)

### Backend ✅
- FastAPI server with MongoDB Atlas connection
- JWT authentication with httpOnly cookies (8-hour expiry)
- SPOC email validation (supports both emp_email and empEmail)
- Customer login audit trail
- Course catalog endpoint serving static JSON
- Batches endpoint with filtering (status, location, track)
- SSE endpoint streaming live batch updates with keepalive
- CORS configuration for credentials

### Frontend ✅
- Login page with form validation
- Portal dashboard with 2-column layout (catalog + calendar)
- Sticky header with user info, LIVE SSE indicator, logout
- Course catalog with 4 MongoDB courses
- Slide-over panel for course details (overview, who should attend, key topics, outcomes)
- Monthly calendar with Sun-Sat grid, multi-day batch events
- Color-coded seat counts (emerald/amber/rose)
- Location and track filters with "Others" support
- Month navigation (prev/next/today)
- SSE connection with automatic reconnection
- MongoDB professional dark theme (slate-950 background, emerald-500 accent)
- Custom fonts: Outfit (headings), IBM Plex Sans (body), IBM Plex Mono (data)

## Prioritized Backlog

### P1 - Potential Enhancements
- Auto-navigate to next month containing batches (UX improvement)
- Add CSV export of batch availability
- Email notifications when batches open/close
- Calendar view toggle (week/month/agenda views)

### P2 - Future Features  
- Backfill trainingName field in batches collection
- Add batch filter by date range
- Show historical batches (completed)
- Multi-language support

### P0 - Critical (None remaining)
All P0 features completed and tested.

## Testing Results
- Iteration 1: All backend endpoints passing, SSE issue identified
- Iteration 2: SSE issue FIXED, all core flows verified working
