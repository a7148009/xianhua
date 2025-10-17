// 临时占位文件 - 此云函数已废弃
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  return {
    success: false,
    message: '此功能已废弃'
  };
};
