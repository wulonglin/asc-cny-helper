# AppStoreConnect 汇率时间助手

一个 Tampermonkey/Greasemonkey 用户脚本，用于优化 App Store Connect 趋势页面的显示。

## 功能特性

- 💱 **USD 自动转 CNY**：实时汇率转换（缓存 6 小时）
- 🕐 **UTC 转北京时间**：时间自动 +8 小时
- 📅 **英文日期转中文**：如 "Mar 2, 2026 3 a.m." → "3月2日 11:00"
- 📊 **纵轴收入数值转换**：收入/销售额页面的纵轴数值自动转人民币
- 💰 **支持多种货币格式**：`$100`、`US$100`、`$1.5K` 等

## 安装

1. 安装浏览器扩展：[Tampermonkey](https://www.tampermonkey.net/)（推荐）或 [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)
2. 点击安装脚本：[asc-cny-helper.user.js](https://raw.githubusercontent.com/wulonglin/asc-cny-helper/main/asc-cny-helper.user.js)

## 使用

安装后访问 [App Store Connect](https://appstoreconnect.apple.com/trends/)，脚本会自动运行。

右下角会显示当前汇率：`USD/CNY=7.00`

## 支持的页面

- 趋势页面 (`/trends/*`)
- 分析页面 (`/analytics/*`)

## 技术细节

- 汇率 API：[frankfurter.app](https://api.frankfurter.app/latest?from=USD&to=CNY)
- 备用汇率：7.00（当 API 不可用时）
- 缓存时间：6 小时

## 许可证

MIT License

## 作者

[wulonglin](https://github.com/wulonglin)
