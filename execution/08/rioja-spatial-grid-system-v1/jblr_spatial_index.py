from __future__ import annotations
import math
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import Point
import geopandas as gpd

EPSG_INTERNAL = 25830
_TRANSFORM = Transformer.from_crs(4326, EPSG_INTERNAL, always_xy=True)


class RiojaSpatialIndex:
    """Resolve exact coordinates into the JBLR Rioja hierarchical grid.

    Exact coordinates remain primary evidence; all grid memberships are derived.
    """

    def __init__(self, state_dir: str | Path):
        state_dir = Path(state_dir)
        gpkg = state_dir / 'JBLR_RIOJA_SPATIAL_GRID_SYSTEM_v1.gpkg'
        self.grid10 = gpd.read_file(gpkg, layer='grid_10km')
        self.boundary = gpd.read_file(gpkg, layer='rioja_boundary').geometry.iloc[0]
        self.by_ll = {
            (int(r.easting_min), int(r.northing_min)): r
            for _, r in self.grid10.iterrows()
        }

    def _parent(self, e, n):
        ll = (math.floor(e / 10000) * 10000, math.floor(n / 10000) * 10000)
        return self.by_ll.get(ll)

    @staticmethod
    def _fine_code(parent, e, n, resolution):
        code = parent.cell_code
        prefix = code[:5]
        e10 = int(code[5])
        n10 = int(code[6])
        pe = int(parent.easting_min)
        pn = int(parent.northing_min)
        if resolution == 1000:
            digits, factor = 2, 10
        elif resolution == 100:
            digits, factor = 3, 100
        elif resolution == 10:
            digits, factor = 4, 1000
        else:
            raise ValueError('unsupported resolution')
        i = (int(math.floor(e / resolution) * resolution) - pe) // resolution
        j = (int(math.floor(n / resolution) * resolution) - pn) // resolution
        return f"{prefix}{e10 * factor + i:0{digits}d}{n10 * factor + j:0{digits}d}"

    def index_utm(self, easting, northing):
        e = float(easting)
        n = float(northing)
        parent = self._parent(e, n)
        in_rioja = bool(self.boundary.covers(Point(e, n)))
        if parent is None:
            return {
                'crs': 'EPSG:25830',
                'easting': e,
                'northing': n,
                'selected_10km_parent': False,
                'in_rioja': in_rioja,
                'exact_coordinate_preserved': True,
            }

        dx = e - int(parent.easting_min)
        dy = n - int(parent.northing_min)
        quadrant = ('W' if dx < 5000 else 'E') + ('S' if dy < 5000 else 'N')
        return {
            'crs': 'EPSG:25830',
            'easting': e,
            'northing': n,
            'in_rioja': in_rioja,
            'selected_10km_parent': True,
            'grid_10km': parent.cell_code,
            'grid_5km': f'JBLR5K:{parent.cell_code}:{quadrant}',
            'grid_1km': self._fine_code(parent, e, n, 1000),
            'grid_100m': self._fine_code(parent, e, n, 100),
            'grid_10m': self._fine_code(parent, e, n, 10),
            'exact_coordinate_preserved': True,
        }

    def index_wgs84(self, lat, lon):
        e, n = _TRANSFORM.transform(float(lon), float(lat))
        out = self.index_utm(e, n)
        out['source_crs'] = 'EPSG:4326'
        out['source_lat'] = float(lat)
        out['source_lon'] = float(lon)
        return out
