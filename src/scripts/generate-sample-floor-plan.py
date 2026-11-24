import os
import math
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 2500
HEIGHT = 3000

# Scale factor: 170 pixels = 1.0 meter
SCALE = 170.0

# Building offset on canvas
ORIGIN_X = 400
ORIGIN_Y = 380

# Building dimensions in meters
BLDG_WIDTH_M = 10.0
BLDG_LENGTH_M = 12.0

BLDG_WIDTH_PX = int(BLDG_WIDTH_M * SCALE)   # 1700 px
BLDG_LENGTH_PX = int(BLDG_LENGTH_M * SCALE) # 2040 px

# Wall thicknesses in pixels
EXT_WALL_THICKNESS = 24  # ~14 cm
INT_WALL_THICKNESS = 16  # ~10 cm

# Color palette (Architectural blueprint on crisp white)
BG_COLOR = (255, 255, 255)
WALL_FILL_COLOR = (40, 50, 65)         # Dark architectural slate
WALL_STROKE_COLOR = (15, 23, 42)      # Deep navy black
ROOM_BG_TINT = (248, 250, 252)         # Very light cool gray for rooms
ROOM_BORDER_COLOR = (226, 232, 240)
DOOR_COLOR = (71, 85, 105)             # Slate for door leaves
ARC_COLOR = (148, 163, 184)            # Slate light for swing arc
WINDOW_FRAME_COLOR = (30, 41, 59)
WINDOW_GLASS_COLOR = (186, 230, 253)   # Sky blue tint for glass
FURNITURE_STROKE = (148, 163, 184)     # Subtle reference furniture stroke
FURNITURE_FILL = (241, 245, 249)       # Subtle light fill
DIM_LINE_COLOR = (100, 116, 139)       # Neutral slate for dimensions
DIM_TEXT_COLOR = (30, 41, 59)
TITLE_COLOR = (15, 23, 42)
GRID_LINE_COLOR = (241, 245, 249)

# Load fonts
font_dir = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')
def get_font(name, size):
    path = os.path.join(font_dir, name)
    if os.path.exists(path):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

font_title = get_font('segoeuib.ttf', 38)
font_subtitle = get_font('segoeui.ttf', 22)
font_room_name = get_font('segoeuib.ttf', 26)
font_room_dim = get_font('segoeui.ttf', 20)
font_dim = get_font('segoeuib.ttf', 18)
font_block_label = get_font('segoeui.ttf', 16)
font_block_val = get_font('segoeuib.ttf', 18)

def to_px(xm, ym):
    return int(ORIGIN_X + xm * SCALE), int(ORIGIN_Y + ym * SCALE)

print("Script template ready.")

