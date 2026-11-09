# IncidentHub & AI Agent KM Integration Guide

This guide describes how to connect **AI Agents** (such as Claude Desktop, Cursor, Antigravity, or custom local LLM agents) to IncidentHub as an enterprise Knowledge Management (KM) and AI IT Support Agent.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────┐
│             AI Agent / Assistant             │
│  (Claude / Cursor / Local LLM via Ollama)    │
└───────────────────────┬──────────────────────┘
                        │
       ┌────────────────┴────────────────┐
       │ (Option A: MCP Realtime)        │ (Option B: Vector RAG)
       ▼                                 ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│ IncidentHub MCP Server    │     │ GET /api/mcp/v1/km        │
│ - search_incidents        │     │ (Bulk Markdown Corpus)    │
│ - get_incident_diagnostics│     │             ▼             │
│ - export_km_article       │     │ Vector DB (Chroma/Qdrant) │
└─────────────┬─────────────┘     └─────────────┬─────────────┘
              │                                 │
              └────────────────┬────────────────┘
                               ▼
                   ┌───────────────────────┐
                   │ SQLite (incident.db)  │
                   └───────────────────────┘
```

- **IncidentHub**: The operational System of Record (Incident tracking, triage, resolution, clean text sanitization).
- **Agent**: The System of Intelligence (KM retrieval, semantic search, interactive troubleshooting).

---

## 2. MCP Realtime Connection (Stdio)

Add IncidentHub to your AI agent configuration (e.g. `agent.config.json` or MCP settings):

```json
{
  "mcpServers": {
    "incidenthub": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "D:/Develop/nextjs/Incident",
      "env": {
        "DATABASE_URL": "file:./data/incident.db"
      }
    }
  }
}
```

### Available MCP Tools for Agents:
1. `search_incidents`: Search closed and active incidents by keyword and category.
2. `get_incident_diagnostics`: Retrieve sanitized resolution notes, error symptoms, and recovery steps.
3. `export_km_article`: Generate formatted Markdown knowledge base articles with YAML frontmatter.

---

## 3. Agent System Prompt Template

Use this prompt to align your AI Agent with your organization's IT Knowledge Base:

```markdown
You are IT Support Agent, an enterprise support and knowledge management assistant powered by IncidentHub.

Your responsibilities:
1. When a user reports an issue, invoke `search_incidents` using relevant keywords to check if this problem has been resolved previously.
2. If similar incidents exist, inspect their details with `get_incident_diagnostics` or `export_km_article` to extract verified root causes and solutions.
3. Provide step-by-step guidance based solely on verified resolution records. Cite the Ticket No (e.g., INC-202610-001) for auditing.
4. If no matching resolution exists, suggest standard triage steps and offer to help document the incident for human engineers.
```

---

## 4. Bulk Knowledge Corpus & Vector RAG Ingestion

To embed resolved incidents into a local Vector DB (e.g., ChromaDB, Qdrant, LanceDB) using local embeddings (e.g., `nomic-embed-text` or `bge-m3`):

### HTTP Ingestion Endpoint:
- **URL**: `GET /api/mcp/v1/km`
- **Headers**:
  - `x-api-key: <your_ihub_live_api_key>` (or `Authorization: Bearer <key>`)

### Fetching Bulk Corpus:
```bash
curl -H "x-api-key: ihub_live_samplekey" http://localhost:3000/api/mcp/v1/km
```

### Response Schema:
```json
{
  "schema": "incidenthub.km.v1",
  "generatedAt": "2026-11-03T15:45:00.000Z",
  "total": 142,
  "articles": [
    {
      "ticketNo": "INC-202610-001",
      "category": "Network",
      "urgency": "HIGH",
      "closedAt": "2026-10-26T12:00:00.000Z",
      "markdown": "---\ntitle: \"Core Switch VLAN Mismatch\"\nticket_id: \"INC-202610-001\"\ncategory: \"Network\"\nurgency: \"HIGH\"\ntags: [\"NETWORK_CONNECTIVITY\", \"CONFIG_ERROR\"]\nresolved_at: \"2026-10-26T12:00:00.000Z\"\n---\n\n# Incident Knowledge Article: INC-202610-001\n..."
    }
  ]
}
```

### Python RAG Ingestion Snippet:
```python
import requests
import chromadb

# 1. Fetch sanitized knowledge corpus from IncidentHub
res = requests.get(
    "http://localhost:3000/api/mcp/v1/km",
    headers={"x-api-key": "ihub_live_samplekey"}
)
data = res.json()

# 2. Ingest into ChromaDB collection
client = chromadb.PersistentClient(path="./chroma_km_db")
collection = client.get_or_create_collection(name="incident_km")

for item in data.get("articles", []):
    collection.upsert(
        ids=[item["ticketNo"]],
        documents=[item["markdown"]],
        metadatas=[{
            "ticketNo": item["ticketNo"],
            "category": item["category"],
            "urgency": item["urgency"],
        }]
    )

print(f"Successfully indexed {len(data['articles'])} articles into local KM vector database.")
```
