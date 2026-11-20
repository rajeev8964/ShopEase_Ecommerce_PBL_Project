module.exports = (err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image must be 3 MB or smaller' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This record already exists' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'A referenced record does not exist' });
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error(err);
    return res.status(status).json({ message: 'Internal server error' });
  }
  res.status(status).json({ message: err.message || 'Request failed' });
};
