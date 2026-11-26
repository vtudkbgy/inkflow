  // ============================================================================
  // 11C. INDEXATION SPATIALE 2D (GRILLE HACHÉE O(k) — GOMME, LASSO & VIEWPORT)
  // ============================================================================

  const SPATIAL_GRID_CELL_SIZE = 128;
  const SPATIAL_GRID_MIN_ITEMS = 64;
  const SPATIAL_KEY_BIAS = 65536;
  const SPATIAL_KEY_STRIDE = 131072;

  function spatialCellKey(cx, cy) {
    return (cx + SPATIAL_KEY_BIAS) * SPATIAL_KEY_STRIDE + (cy + SPATIAL_KEY_BIAS);
  }

  class SpatialStrokeGrid {
    constructor(cellSize = SPATIAL_GRID_CELL_SIZE) {
      this.cellSize = Math.max(32, cellSize || SPATIAL_GRID_CELL_SIZE);
      this.invCell = 1 / this.cellSize;
      this.strokeCells = new Map();
      this.shapeCells = new Map();
      this.strokeCount = 0;
      this.shapeCount = 0;
      this._queryStamp = 0;
      this._seenStrokes = new WeakMap();
      this._seenShapes = new WeakMap();
      this._strokeOrder = new WeakMap();
      this._shapeOrder = new WeakMap();
    }

    clear() {
      this.strokeCells.clear();
      this.shapeCells.clear();
      this.strokeCount = 0;
      this.shapeCount = 0;
    }

    _insertInto(cellMap, item, bounds) {
      if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) return;
      const minCx = Math.floor(bounds.minX * this.invCell);
      const maxCx = Math.floor(bounds.maxX * this.invCell);
      const minCy = Math.floor(bounds.minY * this.invCell);
      const maxCy = Math.floor(bounds.maxY * this.invCell);
      // Garde-fou contre un trait géant aberrant (> 64×64 cellules)
      const clampedMaxCx = Math.min(maxCx, minCx + 64);
      const clampedMaxCy = Math.min(maxCy, minCy + 64);
      for (let cx = minCx; cx <= clampedMaxCx; cx++) {
        for (let cy = minCy; cy <= clampedMaxCy; cy++) {
          const key = spatialCellKey(cx, cy);
          let bucket = cellMap.get(key);
          if (!bucket) {
            bucket = [];
            cellMap.set(key, bucket);
          }
          bucket.push(item);
        }
      }
    }

    buildFromPage(page) {
      this.clear();
      if (!page) return this;
      const strokes = page.strokes || [];
      const shapes = page.shapes || [];
      this.strokeCount = strokes.length;
      this.shapeCount = shapes.length;

      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        this._strokeOrder.set(s, i);
        const b = getCachedStrokeBounds(s);
        if (b) this._insertInto(this.strokeCells, s, b);
      }
      for (let i = 0; i < shapes.length; i++) {
        const sh = shapes[i];
        this._shapeOrder.set(sh, i);
        const b = getShapeBoundingBox(sh);
        if (b) this._insertInto(this.shapeCells, sh, b);
      }
      return this;
    }

    _queryMap(cellMap, seenMap, orderMap, minX, minY, maxX, maxY, preserveOrder = true) {
      if (cellMap.size === 0) return [];
      const minCx = Math.floor(minX * this.invCell);
      const maxCx = Math.floor(maxX * this.invCell);
      const minCy = Math.floor(minY * this.invCell);
      const maxCy = Math.floor(maxY * this.invCell);
      const stamp = ++this._queryStamp;
      const out = [];
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const bucket = cellMap.get(spatialCellKey(cx, cy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const item = bucket[i];
            if (seenMap.get(item) !== stamp) {
              seenMap.set(item, stamp);
              out.push(item);
            }
          }
        }
      }
      if (preserveOrder && out.length > 1) {
        out.sort((a, b) => (orderMap.get(a) || 0) - (orderMap.get(b) || 0));
      }
      return out;
    }

    queryStrokesRect(minX, minY, maxX, maxY, preserveOrder = true) {
      return this._queryMap(this.strokeCells, this._seenStrokes, this._strokeOrder, minX, minY, maxX, maxY, preserveOrder);
    }

    queryShapesRect(minX, minY, maxX, maxY, preserveOrder = true) {
      return this._queryMap(this.shapeCells, this._seenShapes, this._shapeOrder, minX, minY, maxX, maxY, preserveOrder);
    }
  }

  const pageSpatialIndexCache = new WeakMap();

  function invalidatePageSpatialIndex(page) {
    if (!page || typeof page !== 'object') return;
    page._spatialVersion = (page._spatialVersion || 0) + 1;
    pageSpatialIndexCache.delete(page);
  }

  function getPageSpatialIndex(page) {
    if (!page || typeof page !== 'object') return null;
    const strokes = page.strokes || [];
    const shapes = page.shapes || [];
    const ver = page._spatialVersion || 0;
    let entry = pageSpatialIndexCache.get(page);
    if (
      entry &&
      entry.strokesRef === strokes &&
      entry.strokesLen === strokes.length &&
      entry.shapesRef === shapes &&
      entry.shapesLen === shapes.length &&
      entry.version === ver
    ) {
      return entry.grid;
    }
    const grid = entry ? entry.grid : new SpatialStrokeGrid(SPATIAL_GRID_CELL_SIZE);
    grid.buildFromPage(page);
    pageSpatialIndexCache.set(page, {
      grid,
      strokesRef: strokes,
      strokesLen: strokes.length,
      shapesRef: shapes,
      shapesLen: shapes.length,
      version: ver
    });
    return grid;
  }

  function queryPageStrokesInRect(page, minX, minY, maxX, maxY, preserveOrder = true) {
    const strokes = (page && page.strokes) || [];
    if (strokes.length <= SPATIAL_GRID_MIN_ITEMS) return strokes;
    const grid = getPageSpatialIndex(page);
    return grid ? grid.queryStrokesRect(minX, minY, maxX, maxY, preserveOrder) : strokes;
  }

  function queryPageStrokesAtPoint(page, wx, wy, radius) {
    const r = Math.max(1, radius || 12);
    return queryPageStrokesInRect(page, wx - r, wy - r, wx + r, wy + r, false);
  }

  function queryPageShapesInRect(page, minX, minY, maxX, maxY, preserveOrder = true) {
    const shapes = (page && page.shapes) || [];
    if (shapes.length <= SPATIAL_GRID_MIN_ITEMS) return shapes;
    const grid = getPageSpatialIndex(page);
    return grid ? grid.queryShapesRect(minX, minY, maxX, maxY, preserveOrder) : shapes;
  }
