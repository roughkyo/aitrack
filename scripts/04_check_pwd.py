import xml.etree.ElementTree as ET
import os

unzipped_path = r'c:\Users\ysj\Desktop\upload_all\자공고이수트랙\intermediate_results\excel_unzipped'
shared_strings_path = os.path.join(unzipped_path, 'xl', 'sharedStrings.xml')
sheet_path = os.path.join(unzipped_path, 'xl', 'worksheets', 'sheet2.xml')

namespace = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def get_shared_strings():
    if not os.path.exists(shared_strings_path):
        return []
    tree = ET.parse(shared_strings_path)
    root = tree.getroot()
    return [t.text for t in root.findall('.//ns:t', namespace)]

def parse_sheet(shared_strings):
    tree = ET.parse(sheet_path)
    root = tree.getroot()
    
    rows = []
    for row in root.findall('.//ns:row', namespace):
        cells = []
        for cell in row.findall('ns:c', namespace):
            value_node = cell.find('ns:v', namespace)
            if value_node is not None:
                val = value_node.text
                cell_type = cell.get('t')
                if cell_type == 's': # Shared string
                    cells.append(shared_strings[int(val)])
                else:
                    cells.append(val)
            else:
                cells.append("")
        rows.append(cells)
    return rows

try:
    ss = get_shared_strings()
    data_rows = parse_sheet(ss)
    
    headers = data_rows[0]
    pwd_idx = -1
    for i, h in enumerate(headers):
        if '비번' in str(h): pwd_idx = i
        
    print("Password column index:", pwd_idx)
    if pwd_idx != -1:
        # Check first row with a password
        for row in data_rows[1:10]:
            if len(row) > pwd_idx and row[pwd_idx]:
                print(f"Sample password: {row[pwd_idx]}")
                break
except Exception as e:
    print(f"Error: {e}")
