module.exports = (err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Image must be 3 MB or smaller' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This record already exists' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'A referenced record does not exist' });
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
};
