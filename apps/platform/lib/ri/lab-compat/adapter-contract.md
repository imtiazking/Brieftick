# Design Lab ↔ production adapter contract

```
Design Lab view (markup / filters / tabs)
        ↓
lab-compat mappers (DTO shaping, taxonomy)
        ↓
production services (`lib/ri/services/*`)
        ↓
Supabase / PostgreSQL (RLS)
```

- No second data model.
- No runtime import from the Design Lab application tree.
- Business-authoritative state: database only (not `localStorage`).
