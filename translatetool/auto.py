import pandas as pd
import re
import os

def read_file_lines(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return file.readlines()

def remove_trailing_tags(s):
    """
    去掉行尾连续出现的 [xxx] 形式的标签。
    例如：
      'こんにちは[p]'        -> 'こんにちは'
      'こんにちは[p][l]'     -> 'こんにちは'
      '「[怪物]来了」[p]'    -> '「[怪物]来了」'
      '[p]'                  -> ''  （整行只有标签则变成空）
    句中出现的 [xxx] 不会被删，例如：
      'こ[p]んにちは'        -> 保持不变
    """
    return re.sub(r'(\[[^\]]*\])+\s*$', '', s).rstrip()

def extract_dialogue_and_text(file_path):
    lines = read_file_lines(file_path)
    data = []
    in_dialogue = False
    line_number = 0

    for line in lines:
        line_number = line_number + 1
        stripped = line.strip()

        # 规则 1：跳过 * 开头的行
        if stripped.startswith('*'):
            continue

        # 原有逻辑：tb 区块开始/结束
        if '[tb_start' in line:
            in_dialogue = True
            continue
        if '[_tb_end' in line and in_dialogue:
            in_dialogue = False
            continue

        if in_dialogue:
            # 说话人行：#xxxx
            if stripped.startswith('#'):
                speaker_line = stripped
                if len(speaker_line) > 1:
                    data.append((os.path.basename(file_path), line_number, speaker_line))
            else:
                # 台词行：只去掉“行尾的标签”，句中保留
                dialogue_content = remove_trailing_tags(stripped)
                if dialogue_content:
                    data.append((os.path.basename(file_path), line_number, dialogue_content))
        else:
            # 提取 text="..." 内容；同样只去掉尾部标签（以防有格式标记）
            text_match = re.search(r'text="([^"]+)"', line)
            if text_match:
                text_content = text_match.group(1)
                text_content = remove_trailing_tags(text_content)
                if text_content:
                    data.append((os.path.basename(file_path), line_number, text_content))

    return data

def process_all_ks_files(folder_path):
    all_data = []
    for file_name in os.listdir(folder_path):
        if file_name.endswith('.ks'):
            file_path = os.path.join(folder_path, file_name)
            file_data = extract_dialogue_and_text(file_path)
            all_data.extend(file_data)
    
    return pd.DataFrame(all_data, columns=['File Name', 'Line Number', 'Extracted Content'])

folder_path = '.'  # Adjust to your folder as needed
results_df = process_all_ks_files(folder_path)

csv_file_name = 'extracted_dialogues_and_texts.csv'
results_df.to_csv(csv_file_name, index=False, encoding='utf-8-sig')

print(f"Dialogues and texts extracted and saved to '{csv_file_name}'.")
