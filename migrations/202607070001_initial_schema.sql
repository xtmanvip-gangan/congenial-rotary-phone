create table wecom_users (
  id uuid primary key,
  wecom_user_id varchar(64) not null unique,
  wecom_name varchar(100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operator_accounts (
  id uuid primary key,
  wecom_user_id varchar(64) not null unique,
  role varchar(20) not null check (role in ('operator', 'super_admin')),
  display_name varchar(100) not null,
  status varchar(20) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_types (
  id uuid primary key,
  type_code varchar(50) not null unique,
  type_name varchar(50) not null,
  aggregation_mode varchar(30) not null,
  entry_schema jsonb not null,
  metric_unit varchar(30),
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key,
  name varchar(100) not null,
  type_id uuid not null references activity_types(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status varchar(20) not null default 'draft',
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activity_items (
  id uuid primary key,
  activity_id uuid not null references activities(id),
  item_code varchar(50) not null,
  item_name varchar(100) not null,
  item_type varchar(30) not null,
  sort_order int not null default 0,
  enabled boolean not null default true
);

create table reward_rules (
  id uuid primary key,
  activity_id uuid not null references activities(id),
  item_id uuid references activity_items(id),
  compare_mode varchar(20) not null default 'gte',
  threshold numeric(18, 2) not null,
  reward_type varchar(20) not null,
  reward_label varchar(200) not null,
  reward_payload jsonb,
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key,
  activity_id uuid not null references activities(id),
  anchor_user_id uuid not null references wecom_users(id),
  anchor_name varchar(100) not null,
  operator_id uuid not null references operator_accounts(id),
  live_date date not null,
  live_start_time time not null,
  review_status varchar(20) not null default 'pending',
  grant_status varchar(20) not null default 'pending',
  reject_reason text,
  reward_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submission_items (
  id uuid primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  item_id uuid references activity_items(id),
  item_name varchar(100) not null,
  quantity numeric(18, 2) not null,
  extra_payload jsonb
);

create table attachments (
  id uuid primary key,
  submission_id uuid references submissions(id) on delete cascade,
  bucket varchar(100) not null,
  object_key varchar(255) not null,
  file_type varchar(20) not null check (file_type in ('submission_proof', 'grant_proof')),
  file_url text not null,
  created_at timestamptz not null default now()
);

create table review_logs (
  id uuid primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  action varchar(30) not null,
  operator_account_id uuid references operator_accounts(id),
  note text,
  created_at timestamptz not null default now()
);

create table reward_grants (
  id uuid primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  status varchar(20) not null check (status in ('pending', 'granted')),
  granted_by uuid references operator_accounts(id),
  granted_at timestamptz,
  remark text,
  proof_attachment_id uuid references attachments(id)
);

create table notification_logs (
  id uuid primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  notification_type varchar(50) not null,
  receiver_wecom_user_id varchar(64) not null,
  receiver_role varchar(20) not null,
  message_title varchar(200) not null,
  message_content text not null,
  status varchar(20) not null check (status in ('pending', 'success', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_submissions_activity_operator_date
  on submissions(activity_id, operator_id, live_date);

create index idx_submissions_anchor_activity_date
  on submissions(anchor_user_id, activity_id, live_date);

create index idx_notification_logs_submission_type
  on notification_logs(submission_id, notification_type);
