// api/features/merge-batch.feature.js
module.exports = ({ express, UPLOAD_DIR, getUploader, storage }) => {
  const router = require('../merge-batch')({
    upload: getUploader('pdf', storage),
    UPLOAD_DIR
  });
  return { name: 'merge_batch', path: '/api/merge-batch', router };
};
