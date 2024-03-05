const { Client } = require("pg");

exports.setupDatabase = async (config) => {
  const client = new Client(config);
  await client.connect();

  // Hàm lọc dữ liệu dựa trên kích thước JSON và kích thước của từng trường
  const createFilterFunctionSQL = `
    CREATE OR REPLACE FUNCTION filter_large_data(data JSON) RETURNS JSON AS $$
    DECLARE
        result JSON := '{}';
        field TEXT;
        field_value TEXT;
    BEGIN
        IF octet_length(data::text) > 7999 THEN
            FOR field IN SELECT json_object_keys(data)
            LOOP
                field_value := data->>field;
                IF octet_length(field_value) < 248 THEN
                    result := jsonb_set(result, '{'||field||'}', to_jsonb(field_value));
                ELSE
                    result := jsonb_set(result, '{'||field||'}', '"large size"');
                END IF;
            END LOOP;
            RETURN result;
        ELSE
            RETURN data;
        END IF;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFilterFunctionSQL);

  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION notify_change()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'delete',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_large_data(row_to_json(OLD))
            )::text);
        ELSIF (TG_OP = 'UPDATE') THEN
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', 'update',
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'new_data', filter_large_data(row_to_json(NEW)),
                'old_data', filter_large_data(row_to_json(OLD))
            )::text);
        ELSE
            PERFORM pg_notify('tbl_changes', json_build_object(
                'action', TG_OP,
                'table_name', TG_TABLE_NAME,
                'database_name', current_database(),
                'data', filter_large_data(row_to_json(NEW))
            )::text);
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  await client.query(createFunctionSQL);

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `);

  for (let row of tablesRes.rows) {
    const tableName = row.table_name;
    const triggerName = `trigger_${tableName}_change`;
    await client.query(`
      DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
      CREATE TRIGGER ${triggerName}
      AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
      FOR EACH ROW EXECUTE FUNCTION notify_change();
    `);
  }

  console.log("Database setup complete with triggers for all tables.");
  return client;
};
