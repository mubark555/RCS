#!/usr/bin/env bash
# يشغّل المخطط + البيانات + الترحيلات + اختبارات SQL على قاعدة PostgreSQL محلية مؤقتة.
# الاتصال عبر متغيرات psql القياسية: PGHOST / PGPORT / PGUSER (مستخدم بصلاحية إنشاء قواعد).
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
cd "$(dirname "$0")/.."
DB="violet_test_$$"
psql -d postgres -qc "create database $DB"
trap 'psql -d postgres -qc "drop database if exists $DB" >/dev/null' EXIT
run() { psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; echo "✓ $1"; }
run tests/sql/00_supabase_stubs.sql
run supabase/schema.sql
run supabase/seed.sql
for f in supabase/migrations/*.sql; do run "$f"; run "$f"; done   # مرتان: للتأكد من إمكانية إعادة التشغيل
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f tests/sql/10_workflow_test.sql
