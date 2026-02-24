import pandas as pd
import json
import os

excel_path = r'c:\Users\ysj\Desktop\upload_all\자공고이수트랙\certification\인증용_학생명렬표.xlsx'
output_path = r'c:\Users\ysj\Desktop\upload_all\자공고이수트랙\secondary_data\student_list.json'

print(f"Reading {excel_path}...")
xl = pd.ExcelFile(excel_path)
sheet_names = xl.sheet_names
print(f"Sheets: {sheet_names}")

# '학번'과 '이름'이 모두 있는 시트 찾기
df = None
selected_sheet = None
for sheet in sheet_names:
    temp_df = pd.read_excel(excel_path, sheet_name=sheet)
    cols = [str(c).strip() for c in temp_df.columns]
    if '학번' in cols and '이름' in cols:
        df = temp_df
        selected_sheet = sheet
        df.columns = cols # Clean column names
        print(f"Found target sheet: {sheet}")
        break

if df is None:
    raise ValueError("Could not find a sheet with '학번' and '이름' columns")

# '학생' 필터 (있을 경우만)
if '구분' in df.columns:
    df['구분'] = df['구분'].astype(str).str.strip()
    student_df = df[df['구분'] == '학생'].copy()
    print(f"Filtered for '학생': {len(student_df)} rows")
else:
    student_df = df.copy()
    print(f"No '구분' column, using all {len(student_df)} rows")

student_list = []
for _, row in student_df.iterrows():
    raw_id = str(row['학번']).strip()
    # Remove decimal if it's like "10101.0"
    if raw_id.endswith('.0'):
        raw_id = raw_id[:-2]
    
    # 학번 정규화 (4자리 -> 5자리)
    if len(raw_id) == 4:
        student_id = raw_id[0] + '0' + raw_id[1:]
    else:
        student_id = raw_id
        
    student_name = str(row['이름']).strip()
    
    if not student_id or student_id == 'nan' or not student_name or student_name == 'nan':
        continue
        
    try:
        grade = int(student_id[0])
    except:
        grade = 1
        
    student_list.append({
        "id": student_id,
        "name": student_name,
        "grade": grade
    })

# JSON 저장
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(student_list, f, ensure_ascii=False, indent=2)

print(f"✅ Total students saved: {len(student_list)}")
print(f"Preview (first 3): {student_list[:3]}")
