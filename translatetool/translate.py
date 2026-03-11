import pandas as pd
import os
import re

xlsx_file = 'extracted_dialogues_and_texts.xlsx'
df = pd.read_excel(xlsx_file)

df['Translated Content'] = df['Translated Content'].fillna(df['Extracted Content'])

total_rows = len(df)
current_row = 0

target_pat = re.compile(r'target="[^"]*"')

def replace_outside_target(text, old, new):
    if not isinstance(text, str):
        return text
    old = str(old)
    new = str(new)
    if old == "":
        return text

    parts = []
    last = 0
    for m in target_pat.finditer(text):
        outside = text[last:m.start()]
        outside = outside.replace(old, new)
        parts.append(outside)
        parts.append(m.group(0))
        last = m.end()

    tail = text[last:]
    tail = tail.replace(old, new)
    parts.append(tail)

    return "".join(parts)

for index, row in df.iterrows():
    current_row = current_row + 1
    print(f"正在处理 {current_row} / {total_rows} ...")

    file_name = row['File Name']
    line_num = row['Line Number']
    original_text = row['Extracted Content']
    translated_text = row['Translated Content']

    if isinstance(original_text, str) and original_text.startswith('*'):
        continue

    file_path = os.path.join('.', str(file_name))

    if os.path.isfile(file_path):
        with open(file_path, 'r', encoding='utf-8') as file:
            lines = file.readlines()

        idx = int(line_num) - 1
        if 0 <= idx < len(lines):
            line = lines[idx]
            if str(original_text) in line:
                lines[idx] = replace_outside_target(line, original_text, translated_text)

        with open(file_path, 'w', encoding='utf-8') as file:
            file.writelines(lines)
    else:
        print(f"文件 {file_name} 不存在于当前目录中。")

print(f"完成翻译替换，处理了总共 {total_rows} 行。")
