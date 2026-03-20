/**
 * Manual Feishu image file token → basename (no extension) under docs/{cn|en}/assets/images/.
 * Takes precedence over auto-generated `feishu-image-token-map.json` from `feishu:sync-images`.
 */
export const IMAGE_TOKEN_TO_BASENAME = {
  // client_vars image blocks use file/cover tokens (stream URL path), not mount_node_token
  VdvibD9sYomJFtx9MpVc8Ucxnbd: '00-reading-guide-h730',
  IVwWbWRiaoje4xxmrD3cRoLfnUb: '00-reading-guide-rs485',
  JFknbP4WpoJJ1Zxra7Dc7iL6nzz: '00-reading-guide-7can',
  HiXrbqrnWo2rDxxMO1NcnlSfndh: '00-reading-guide-general-box',
  RFFwbvmydoRIh1x4wYoc8sCZnxK: '00-reading-guide-4can',
  // legacy mount_node_token ids (curl recipes) if they appear in dumps
  QPLwdud5YoBRAexXK1Ic3M91n7f: '00-reading-guide-h730',
  Frz0di9sToT8BNxsSMacYGv3ngd: '00-reading-guide-7can',
  RD8wddXeao3LpJxGG4ncH4Non3c: '00-reading-guide-general-box',
  QyERdQNNtoeo77xlSrucLZvmnDd: '00-reading-guide-4can',
  // 1.4 电机接口说明 — matches docs/{cn|en}/assets/images/1.4-motor-interface-*.png
  K7uFbmhn0oHjugx9OAFcGCVOnEf: '1.4-motor-interface-1',
  HPVZbSA5los3dwxmrVmc4E7an3c: '1.4-motor-interface-2',
  // 2.1 高擎电机调试助手快速上手 — matches docs/{cn|en}/assets/images/2.1-*.png
  R1GHbjQshoJkSlx0S1DcoJH4nNh: '2.1-usb-fdcan',
  QK4rbkt1moZxXhxLrTmcg2XmnNI: '2.1-motor-5047',
  ZtuibJH9Oo0oWlxezYQcN0P5nwb: '2.1-usb-cable',
  PC1Tb2ygKoJvtfx9z9Hc3JiInDO: '2.1-xt30-cable',
  PyKWbha8jogXD3xyDpycNk47n8g: '2.1-xt30-female',
  JQwQbi7ISo07ydxvERrcyWYvnsg: '2.1-software',
  HfvFbthXeomYLLxqDeOcuFuAnFb: '2.1-connection',
  WwvVbfcesoCiCxxWeELc33r0npn: '2.1-poweron',
  UWbjbxpB5orQmoxrym7c1drGnbb: '2.1-app-connect',
  Y3X5bYDB7oObIFxTKyBcYbqOncb: '2.1-param-setting',
  ZlEgbN74so5X0IxUbIGcUpb7n0V: '2.1-motor-control',
};
