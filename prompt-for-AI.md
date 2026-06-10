- BOOKMARKS APP
	- Context/Role
		- I need an app that allows me to manage bookmarks (URLs) organized in folders/categories
			- self-hosted
			- open-source
			- runs entirely in Docker
		- the app is self hosted
			- runs entirely in Docker
			- base infrastructure defined in: docker-compose.yml
				- postgres:17.8-alpine3.23
				- dpage/pgadmin4:9.12.0
				- nginx:1.26.3-alpine
		- the bookmarks are stored in PostgreSQL
		- there is a GUI (SPA) that allows full CRUD on bookmarks and folders
		- the killer feature is the export:
			- user selects one or more folders/categories from the frontend
			- the app generates a real bookmarks.html (Netscape Bookmark Format)
			- the file can be imported directly in any browser (Chrome, Firefox, Safari)
		- de facto the app consists of 2 parts:
			- REST API
				- CRUD for folders and bookmarks
				- export endpoint that generates the bookmarks.html
			- Frontend SPA
				- GUI to manage folders and bookmarks
				- export UI with folder/category selector
		- bookmark deduplication
		- import bookmarks.html
			- POST /import?dryRun=true
		- import robustness
			- tolerate malformed HTML
			- skip invalid bookmarks (log them)
			- fallback title = URL if missing
			- ignore unsupported tags			
	- Task
		- the app runs in
			- web browser
		- the app is an SPA: single page application
		- no login nor authentication required (personal local tool)
		- all services run behind the existing nginx reverse proxy
	- Specifications
		- tech stack
			- Runtime: bun.sh
			- API Framework: Hono
			- Database: PostgreSQL (from docker-compose)
				- database constraints
					- folders.parent_id FK → folders.id (ON DELETE CASCADE or RESTRICT TBD)
					- bookmarks.folder_id FK → folders.id (ON DELETE CASCADE)
					- unique constraint: (normalized_url, folder_id)
					- NOT NULL constraints where applicable
			- Frontend: React + TypeScript + Vite
				- nginx serves (recommended)
			- Proxy: Nginx (from docker-compose)
				- nginx serves /var/share/nginx/html
			- Test: Bun test runner (built-in) + Supertest + Playwright for E2E
		- data model
			- Folder
				- id (UUID)
				- name (string, required)
				- parent_id (UUID, nullable — supports nested folders)
				- created_at
				- updated_at
			- Bookmark
				- id (UUID)
				- folder_id (UUID, required — FK to Folder)
				- title (string, required)
				- url (string, required)
				- description (string, nullable)
				- favicon_url (string, nullable)
				- created_at
				- updated_at
		- use cases
			- manage folders
				- create a folder
					- name is required
					- optional parent folder (nested structure)
				- rename a folder
				- delete a folder
					- warn if folder contains bookmarks
					- cascade delete or block (TBD)
				- move a folder under a different parent
			- manage bookmarks
				- add a bookmark to a folder
					- title and url are required
					- optional description
					- favicon_url auto-fetched from the URL (via Google favicon API or similar)
				- edit a bookmark
				- delete a bookmark
				- move a bookmark to a different folder
			- export bookmarks.html (the killer feature)
				- user opens the export panel in the frontend
				- user selects one or more folders/categories (with a tree-style checkbox UI)
				- the app generates a valid Netscape Bookmark Format HTML file
					- standard format importable by Chrome, Firefox, Safari
					- nested folders are preserved in the output
					- example output structure:
						- <!DOCTYPE NETSCAPE-Bookmark-file-1>
						- <DL><p> for each folder
						- <DT><A HREF="..."> for each bookmark
				- the file is downloaded directly in the browser
		- Folder constraints
			- prevent cyclic parent relationships
			- configurable max depth (env var, default: 10)
		- favicon handling
			- async fetch at creation time (non-blocking)
			- store result if successful
			- fallback strategy in frontend if missing
			- optional re-fetch endpoint (future)
		- export implementation
			- streaming response (chunked)
			- content-type: text/html
			- content-disposition: attachment
			- folders and bookmarks sorted by position
  			- deterministic output guaranteed
			- export folder metadata
				- include ADD_DATE for folders
				- include LAST_MODIFIED for folders  			
		- order
			- Folder
			  - position (integer)
			  	- gap-based 
			- Bookmark
			  - position (integer)
			  	- gap-based 
		- indexes
			- folders(parent_id)
			- bookmarks(folder_id)
		- delete behavior
		  - folder deletion requires explicit confirmation if not empty
		  - supports cascade delete via query param ?force=true
		  - RESTRICT by default + ?force=true cascade
		- pagination
			- list endpoints support limit/offset
		- filtering
			- bookmarks by folder_id
		- tree endpoint
  			- GET /folders/tree (returns nested structure)
			- single query + in-memory tree construction
				- SELECT * FROM folders ORDER BY position;
			- no recursive DB queries
  		- bookmark deduplication
  			- is triggered from the GUI
			- URL normalization before storage
			- uniqueness constraint: (normalized_url, folder_id)
			- enforced at API level
			- optional deduplication endpoint
		- import bookmarks.html
			- supports Netscape Bookmark Format
			- recursive parsing of folder structure
			- import into selected target folder
			- dry-run mode supported
			- deduplication applied during import
			- returns import summary in the GUI
			- skip silently
				- finish the import
				- log and warning in the GUI
		- required env vars
			- DATABASE_URL
			- PORT (api)
			- NODE_ENV
			- MAX_FOLDER_DEPTH
		- database migrations
			- versioned migrations
			- executed on startup (api container)
			- raw SQL runner
		- data integrity
			- transactions for:
			- move operations
			- delete cascades
		- performance limits
			- no max export timeout
			- pagination limits (max 1000 per request)
		- URL normalization rules
			- lowercase scheme and host
			- remove default ports (80, 443)
			- remove trailing slash (except root)
			- strip tracking query params (utm_*, fbclid, etc.)
			- preserve meaningful query params
			- normalize protocol (http/https kept as-is)
		- No URL validation
		- referential integrity
			- bookmarks deleted automatically when folder is deleted
			- folders cannot be deleted if they have children unless forced via API
		- ordering strategy
			- position uses gap-based system (e.g. increments of 100)
			- rebalancing triggered only when needed
		- API error format
			- consistent JSON structure for all errors
			- includes code, message, optional details
		- logging
			- structured logs (JSON)
			- log levels via env var
	- Quality Criterias
		- all the technologies must be open source
			- OpenAPI generated from Zod schemas
			- Swagger UI exposed via /docs
			- healthchecks
				- api: /health endpoint
				- postgres: built-in healthcheck
				- nginx: basic HTTP check
		- all the code is covered by:
			- unitary tests
			- integration tests
			- regression tests
			- E2E tests (Playwright)
			- contract tests (API schema validation)
		- all the configs use
			- environment variables
			- .env files per environment: .env.development / .env.production
			- validated at startup (Zod schema for env vars)
			- never commit .env files (only .env.example)
		- all Docker images pinned to specific versions (no :latest)
			- environments
				- development: hot reload (bun + vite dev server)
				- production: built frontend served via nginx
			- Use multi-stage Dockerfile for frontend
			- static assets served by nginx in production
			- nginx SPA handling
				- fallback to index.html for unknown routes
		- REST API follows standard HTTP conventions
			- GET, POST, PUT, DELETE
			- proper status codes (200, 201, 204, 400, 404, 500)
			- JSON request/response with Zod validation
		- security
			- input sanitization (URLs, strings)
			- prevent XSS in export HTML
				- escape all user-provided fields in export HTML
				- no raw HTML injection allowed
		- test data
			- seed scripts for development
			- deterministic dataset for E2E tests
	- Response Format
		- docker-compose.yml
			- extend the existing bookmarks app v0 - docker-compose.yml
			- add the new services:
				- api (Hono + bun)
				- frontend (React + Vite)
				- nginx routing
  					- /api -> api service
  					- / -> frontend (static build)
			- all images pinned to specific versions
			- export details
				- escape HTML entities
				- include ADD_DATE (unix timestamp)
				- include LAST_MODIFIED
				- ensure UTF-8 encoding
				- size can be unlimited
		- for now do not generate any code
		- I need to discuss first the solution with you
		- I need to improve this prompt adding your precious suggestions
			- for example:
				- should favicon auto-fetching be done at save time or on demand?
				- should nested folders be unlimited depth or capped (e.g. 3 levels)?
				- should the export stream the file or build it in-memory?
	- Verification
		- every time review your output in order to avoid errors, duplications, inconsistencies and unused parts
		- once we will have the tests, run them all, so when i will run them in my ide I will not have issues
	- Proposed Project Structure
		bookmarks-app/
		├── docker-compose.yml          # extends base docker-compose
		├── .env.example
		├── nginx.conf                  # reverse proxy config
		├── api/                        # Hono REST API
		│   ├── src/
		│   │   ├── routes/
		│   │   │   ├── folders.ts
		│   │   │   └── bookmarks.ts
		│   │   ├── db/
		│   │   │   ├── schema.ts       # table definitions
		│   │   │   └── migrations/
		│   │   ├── services/
		│   │   │   ├── export.ts       # bookmarks.html generation
		│   │   │   └── favicon.ts      # favicon auto-fetch
		│   │   └── index.ts
		│   ├── tests/
		│   │   ├── unit/
		│   │   ├── integration/
		│   │   └── e2e/
		│   └── Dockerfile
		├── frontend/                   # React + Vite SPA
		│   ├── src/
		│   │   ├── components/
		│   │   │   ├── FolderTree.tsx
		│   │   │   ├── BookmarkList.tsx
		│   │   │   └── ExportPanel.tsx
		│   │   ├── api/                # API client
		│   │   └── main.tsx
		│   ├── tests/
		│   └── Dockerfile
		└── postgres/
		    └── init/                   # SQL schema migrations
