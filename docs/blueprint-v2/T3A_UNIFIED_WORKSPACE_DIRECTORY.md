# Tranche 3A — Unified Operator Workspace Directory

**Date:** November 21, 2026. **Status:** UI usability slice; production NOT_CERTIFIED.

## Reuse Map
- The existing single Next `Home` application composes all current studios. The new workspace navigation only locates existing components within that composition. It creates **zero** alternate workspaces, services, tables, route bypasses or domain owners.
- Existing Next BFF and Nest API remain the exclusive protected network path; labels and navigation are never treated as permissions.
- Existing studio components and current identity/role gates remain unchanged.

## Changes
- Sticky, accessible named navigation index across 19 already-present surfaces.
- Keyboard-accessible native links, search and functional grouping. Preserves all existing studio component state and owner APIs.
- Stable anchor IDs on current sections and studio mount points; no tab hiding or lifecycle changes.
- Focused registry tests for duplicate anchors and filtering.

## Not accomplished
This does not convert skeleton features into complete studios, guarantee every module is production-ready, create arbitrary new agents or connect external accounts. The user must still sign in to access protected areas.
