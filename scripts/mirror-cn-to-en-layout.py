#!/usr/bin/env python3
"""One-off: mirror docs/cn layout to docs/en with English filenames."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CN = ROOT / "docs" / "cn"
EN = ROOT / "docs" / "en"

# Dir name: cn -> en (relative segment)
DIR_MAP = {
    "01-电机": "01-motor",
    "02-高擎电机调试助手": "02-motor-debugging-assistant",
    "03-电机使用例程": "03-motor-example-code",
    "04-SDK": "04-SDK",
    "05-RS485转FDCAN": "05-RS485-to-FDCAN",
    "06-附件": "06-appendix",
}

# Exact basename renames (Chinese or mixed -> English)
FILE_MAP = {
    "00-阅读指南.md": "00-reading-guide.md",
    "1.1-产品手册.md": "1.1-product-manual.md",
    "1.2-fdcan协议解析.md": "1.2-fdcan-protocol.md",
    "1.3-CAN协议解析.md": "1.3-CAN-protocol.md",
    "1.4-电机接口说明.md": "1.4-motor-interface.md",
    "1.5-常见问题.md": "1.5-faq.md",
    "2.1-快速上手.md": "2.1-quick-start.md",
    "2.2-使用说明.md": "2.2-user-guide.md",
    "2.3-使用问题.md": "2.3-troubleshooting.md",
    "3.1-快速上手.md": "3.1-quick-start.md",
    "3.2-FDCAN例程详细说明.md": "3.2-FDCAN-example-details.md",
    "3.3-CAN例程详细说明.md": "3.3-CAN-example-details.md",
    "3.4-H730开发板接口说明.md": "3.4-H730-dev-board-interface.md",
    "3.5-常见问题.md": "3.5-faq.md",
    "4.1-SDK快速上手.md": "4.1-SDK-quick-start.md",
    "4.1.1-ROS版本SDK的4路叠板快速上手.md": "4.1.1-ROS-SDK-quick-start-4-channel-stacked-board.md",
    "4.1.2-ROS版本SDK的7路主控盒子快速上手.md": "4.1.2-ROS-SDK-quick-start-7-channel-master-control-box.md",
    "4.1.3-ROS版本SDK的通用盒子功率板快速上手.md": "4.1.3-ROS-SDK-quick-start-universal-box-power-board.md",
    "4.1.4-Python版本SDK的4路叠板快速上手.md": "4.1.4-Python-SDK-quick-start-4-channel-stacked-board.md",
    "4.1.5-Python版本SDK的7路主控盒子快速上手.md": "4.1.5-Python-SDK-quick-start-7-channel-master-control-box.md",
    "4.1.6-Python版本SDK的通用盒子功率板快速上手.md": "4.1.6-Python-SDK-quick-start-universal-box-power-board.md",
    "4.2-软件说明.md": "4.2-software-guide.md",
    "4.2.1-SDK-ROS1版.md": "4.2.1-SDK-ROS1.md",
    "4.2.2-SDK-python版.md": "4.2.2-SDK-python.md",
    "4.2.3-SDK通用问题.md": "4.2.3-SDK-common-issues.md",
    "4.2.4-SDK-python环境配置.md": "4.2.4-SDK-python-environment-configuration.md",
    "4.3-硬件说明.md": "4.3-hardware-guide.md",
    "4.3.1-4路CAN叠板.md": "4.3.1-4-channel-CAN-stacked-board.md",
    "4.3.2-7路CAN主控盒子.md": "4.3.2-7-channel-CAN-master-control-box.md",
    "4.3.3-4路CAN主控盒子.md": "4.3.3-4-channel-CAN-master-control-box.md",
    "4.3.4-通用盒子硬件接口说明.md": "4.3.4-universal-box-hardware-interface.md",
    "5.1-硬件说明.md": "5.1-hardware-guide.md",
    "5.2-使用说明.md": "5.2-user-guide.md",
    "5.3-寄存器表.md": "5.3-register-table.md",
    "5.3-寄存器表.xlsx": "5.3-register-table.xlsx",
    "表1-电机寄存器功能表.xlsx": "table1-motor-register-functions.xlsx",
    "表2-电机运行模式.xlsx": "table2-motor-operating-modes.xlsx",
    "表3-电机报错代码说明.xlsx": "table3-motor-error-codes.xlsx",
    "表4-电机一拖多模式ID功能说明.xlsx": "table4-motor-multi-control-mode-ID.xlsx",
    "表5-常用类型说明.md": "table5-common-types.md",
    "1.1-高擎机电模组产品手册.pdf": "1.1-Hightorque-motor-module-product-manual.pdf",
}

# Regex renames for assets/images (basename only)
IMAGE_REGEX = [
    (re.compile(r"^2\.2-使用说明-(img-.*)$"), r"2.2-user-guide-\1"),
    (re.compile(r"^2\.3-使用问题-(img-.*)$"), r"2.3-troubleshooting-\1"),
    (re.compile(r"^3\.1-快速上手-(img-.*)$"), r"3.1-quick-start-\1"),
    (re.compile(r"^3\.2-FDCAN例程详细说明-(img-.*)$"), r"3.2-FDCAN-example-details-\1"),
    (re.compile(r"^3\.3-CAN例程详细说明-(img-.*)$"), r"3.3-CAN-example-details-\1"),
    (re.compile(r"^3\.4-H730开发板接口说明-(img-.*)$"), r"3.4-H730-dev-board-interface-\1"),
    (re.compile(r"^3\.5-常见问题-(img-.*)$"), r"3.5-faq-\1"),
    (re.compile(r"^5\.1-硬件说明-(img-.*)$"), r"5.1-hardware-guide-\1"),
    (re.compile(r"^5\.2-使用说明-(img-.*)$"), r"5.2-user-guide-\1"),
    (re.compile(r"^4\.2\.4-SDK-python环境配置-(img-.*)$"), r"4.2.4-SDK-python-environment-configuration-\1"),
]

TEXT_SUFFIXES = {".md", ".markdown", ".txt", ".tsv", ".csv"}


def map_basename(name: str) -> str:
    if name in FILE_MAP:
        return FILE_MAP[name]
    for rx, repl in IMAGE_REGEX:
        m = rx.match(name)
        if m:
            return rx.sub(repl, name)
    return name


def map_rel_parts(parts: tuple[str, ...]) -> tuple[str, ...]:
    out: list[str] = []
    for p in parts:
        out.append(DIR_MAP.get(p, p))
    return tuple(out)


def cn_to_en_path(cn_file: Path) -> Path:
    rel = cn_file.relative_to(CN)
    parts = map_rel_parts(tuple(rel.parts[:-1]))
    base = map_basename(rel.name)
    return EN.joinpath(*parts, base)


def main() -> None:
    EN.mkdir(parents=True, exist_ok=True)
    for dirpath, dirnames, filenames in os.walk(CN):
        dpath = Path(dirpath)
        rel_dir = dpath.relative_to(CN)
        en_dir = EN.joinpath(*map_rel_parts(tuple(rel_dir.parts)))
        en_dir.mkdir(parents=True, exist_ok=True)

        for fn in filenames:
            src = dpath / fn
            dst = cn_to_en_path(src)
            dst.parent.mkdir(parents=True, exist_ok=True)
            suf = src.suffix.lower()
            if suf in TEXT_SUFFIXES:
                if not dst.exists():
                    dst.touch()
            else:
                shutil.copy2(src, dst)
            print(f"{src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
