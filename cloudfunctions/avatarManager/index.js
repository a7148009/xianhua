// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * avatarManager 云函数
 * 头像管理：上传、获取、生成默认头像
 */
exports.main = async (event, context) => {
  const { action, tempFilePath, openid } = event;

  try {
    switch (action) {
      case 'upload':
        return await uploadAvatar(tempFilePath, openid);

      case 'getTempUrl':
        return await getTempFileURL(event.fileID);

      case 'generateDefault':
        return generateDefaultAvatar(openid);

      default:
        return {
          success: false,
          message: '未知的操作类型'
        };
    }
  } catch (error) {
    console.error('[avatarManager] 错误:', error);
    return {
      success: false,
      message: error.message || '头像处理失败'
    };
  }
};

/**
 * 上传头像到云存储
 */
async function uploadAvatar(tempFilePath, openid) {
  if (!tempFilePath) {
    return {
      success: false,
      message: '缺少临时文件路径'
    };
  }

  try {
    const timestamp = Date.now();
    const cloudPath = `avatars/${openid}_${timestamp}.png`;

    const result = await cloud.uploadFile({
      cloudPath,
      fileContent: tempFilePath
    });

    return {
      success: true,
      fileID: result.fileID,
      cloudPath,
      message: '上传成功'
    };
  } catch (error) {
    console.error('[avatarManager] 上传失败:', error);
    return {
      success: false,
      message: error.message || '上传头像失败'
    };
  }
}

/**
 * 获取临时访问链接
 */
async function getTempFileURL(fileID) {
  if (!fileID) {
    return {
      success: false,
      message: '缺少文件ID'
    };
  }

  try {
    const result = await cloud.getTempFileURL({
      fileList: [fileID]
    });

    if (result.fileList && result.fileList.length > 0) {
      return {
        success: true,
        tempFileURL: result.fileList[0].tempFileURL,
        message: '获取成功'
      };
    }

    return {
      success: false,
      message: '获取临时链接失败'
    };
  } catch (error) {
    console.error('[avatarManager] 获取临时链接失败:', error);
    return {
      success: false,
      message: error.message || '获取临时链接失败'
    };
  }
}

/**
 * 生成默认头像 URL
 */
function generateDefaultAvatar(openid) {
  // 使用 openid 的哈希生成颜色
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];

  let hash = 0;
  if (openid) {
    for (let i = 0; i < openid.length; i++) {
      hash = openid.charCodeAt(i) + ((hash << 5) - hash);
    }
  }

  const colorIndex = Math.abs(hash) % colors.length;
  const color = colors[colorIndex];

  // 返回一个默认头像的 data URL 或者云存储中的默认头像
  return {
    success: true,
    avatarUrl: `https://ui-avatars.com/api/?name=User&background=${color.slice(1)}&color=fff&size=200`,
    isDefault: true,
    message: '生成默认头像成功'
  };
}
