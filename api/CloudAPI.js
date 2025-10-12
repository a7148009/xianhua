const cloudAPI = require('./cloud-api.js');

// Provide compatibility export expected by legacy pages
module.exports = {
  cloudAPI,
  default: cloudAPI
};
