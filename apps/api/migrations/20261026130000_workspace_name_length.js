exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_name_length
      CHECK (char_length(name) BETWEEN 1 AND 120);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE workspaces
      DROP CONSTRAINT workspaces_name_length;
  `);
};
