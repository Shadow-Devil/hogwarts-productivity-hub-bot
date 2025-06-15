--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Ubuntu 17.5-0ubuntu0.25.04.1)
-- Dumped by pg_dump version 17.5 (Ubuntu 17.5-0ubuntu0.25.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: refresh_materialized_views(); Type: FUNCTION; Schema: public; Owner: botd_user
--

CREATE FUNCTION public.refresh_materialized_views() RETURNS void
    LANGUAGE plpgsql
    AS $$
            BEGIN
                -- Refresh user stats summary (most important)
                REFRESH MATERIALIZED VIEW CONCURRENTLY user_complete_profile;
                
                RAISE NOTICE 'Materialized views refreshed successfully';
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Error refreshing materialized views: %', SQLERRM;
            END;
            $$;


ALTER FUNCTION public.refresh_materialized_views() OWNER TO botd_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.users (
    id integer NOT NULL,
    discord_id character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    house character varying(50),
    total_points integer DEFAULT 0,
    weekly_points integer DEFAULT 0,
    monthly_points integer DEFAULT 0,
    all_time_points integer DEFAULT 0,
    monthly_hours numeric(10,2) DEFAULT 0,
    all_time_hours numeric(10,2) DEFAULT 0,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_vc_date date,
    last_monthly_reset date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO botd_user;

--
-- Name: vc_sessions; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.vc_sessions (
    id integer NOT NULL,
    user_id integer,
    discord_id character varying(255) NOT NULL,
    voice_channel_id character varying(255) NOT NULL,
    voice_channel_name character varying(255) NOT NULL,
    joined_at timestamp without time zone NOT NULL,
    left_at timestamp without time zone,
    duration_minutes integer DEFAULT 0,
    date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat timestamp without time zone,
    current_duration_minutes integer DEFAULT 0,
    recovery_note text
);


ALTER TABLE public.vc_sessions OWNER TO botd_user;

--
-- Name: active_voice_sessions; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.active_voice_sessions AS
 SELECT vs.id,
    vs.discord_id,
    u.username,
    u.house,
    vs.voice_channel_id,
    vs.voice_channel_name,
    vs.joined_at,
    (EXTRACT(epoch FROM (now() - (vs.joined_at)::timestamp with time zone)) / (60)::numeric) AS current_duration_minutes,
    vs.date
   FROM (public.vc_sessions vs
     JOIN public.users u ON (((vs.discord_id)::text = (u.discord_id)::text)))
  WHERE (vs.left_at IS NULL)
  ORDER BY vs.joined_at DESC;


ALTER VIEW public.active_voice_sessions OWNER TO botd_user;

--
-- Name: alltime_leaderboard; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.alltime_leaderboard AS
 SELECT row_number() OVER (ORDER BY (all_time_hours + monthly_hours) DESC, (all_time_points + monthly_points) DESC) AS rank,
    discord_id,
    username,
    house,
    (all_time_hours + monthly_hours) AS hours,
    (all_time_points + monthly_points) AS points
   FROM public.users u
  WHERE ((all_time_hours + monthly_hours) > (0)::numeric)
  ORDER BY (all_time_hours + monthly_hours) DESC, (all_time_points + monthly_points) DESC
 LIMIT 50;


ALTER VIEW public.alltime_leaderboard OWNER TO botd_user;

--
-- Name: daily_task_stats; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.daily_task_stats (
    id integer NOT NULL,
    user_id integer,
    discord_id character varying(255) NOT NULL,
    date date NOT NULL,
    tasks_added integer DEFAULT 0,
    tasks_completed integer DEFAULT 0,
    total_task_actions integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.daily_task_stats OWNER TO botd_user;

--
-- Name: daily_task_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.daily_task_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_task_stats_id_seq OWNER TO botd_user;

--
-- Name: daily_task_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.daily_task_stats_id_seq OWNED BY public.daily_task_stats.id;


--
-- Name: daily_voice_stats; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.daily_voice_stats (
    id integer NOT NULL,
    user_id integer,
    discord_id character varying(255) NOT NULL,
    date date NOT NULL,
    total_minutes integer DEFAULT 0,
    session_count integer DEFAULT 0,
    points_earned integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    archived boolean DEFAULT false
);


ALTER TABLE public.daily_voice_stats OWNER TO botd_user;

--
-- Name: daily_voice_activity; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.daily_voice_activity AS
 SELECT date,
    count(DISTINCT discord_id) AS unique_users,
    sum(total_minutes) AS total_minutes,
    sum(session_count) AS total_sessions,
    sum(points_earned) AS total_points,
    avg(total_minutes) AS avg_minutes_per_user
   FROM public.daily_voice_stats
  GROUP BY date
  ORDER BY date DESC;


ALTER VIEW public.daily_voice_activity OWNER TO botd_user;

--
-- Name: daily_voice_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.daily_voice_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_voice_stats_id_seq OWNER TO botd_user;

--
-- Name: daily_voice_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.daily_voice_stats_id_seq OWNED BY public.daily_voice_stats.id;


--
-- Name: houses; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.houses (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    total_points integer DEFAULT 0,
    monthly_points integer DEFAULT 0,
    all_time_points integer DEFAULT 0,
    last_monthly_reset date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.houses OWNER TO botd_user;

--
-- Name: house_leaderboard_with_champions; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.house_leaderboard_with_champions AS
 SELECT h.name AS house_name,
    h.monthly_points AS house_monthly_points,
    h.all_time_points AS house_all_time_points,
    champions.champion_discord_id,
    champions.champion_username,
    champions.champion_points,
    row_number() OVER (ORDER BY h.monthly_points DESC) AS house_rank
   FROM (public.houses h
     LEFT JOIN ( SELECT DISTINCT ON (u.house) u.house,
            u.discord_id AS champion_discord_id,
            u.username AS champion_username,
            u.monthly_points AS champion_points
           FROM public.users u
          WHERE ((u.house IS NOT NULL) AND (u.monthly_points > 0))
          ORDER BY u.house, u.monthly_points DESC, u.username) champions ON (((h.name)::text = (champions.house)::text)))
  ORDER BY h.monthly_points DESC;


ALTER VIEW public.house_leaderboard_with_champions OWNER TO botd_user;

--
-- Name: house_monthly_summary; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.house_monthly_summary (
    id integer NOT NULL,
    house_id integer,
    house_name character varying(50) NOT NULL,
    year_month character varying(7) NOT NULL,
    total_points integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.house_monthly_summary OWNER TO botd_user;

--
-- Name: house_monthly_summary_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.house_monthly_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.house_monthly_summary_id_seq OWNER TO botd_user;

--
-- Name: house_monthly_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.house_monthly_summary_id_seq OWNED BY public.house_monthly_summary.id;


--
-- Name: houses_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.houses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.houses_id_seq OWNER TO botd_user;

--
-- Name: houses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.houses_id_seq OWNED BY public.houses.id;


--
-- Name: monthly_leaderboard; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.monthly_leaderboard AS
 SELECT row_number() OVER (ORDER BY monthly_hours DESC, monthly_points DESC) AS rank,
    discord_id,
    username,
    house,
    monthly_hours AS hours,
    monthly_points AS points
   FROM public.users u
  WHERE (monthly_hours > (0)::numeric)
  ORDER BY monthly_hours DESC, monthly_points DESC
 LIMIT 50;


ALTER VIEW public.monthly_leaderboard OWNER TO botd_user;

--
-- Name: monthly_voice_summary; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.monthly_voice_summary (
    id integer NOT NULL,
    user_id integer,
    discord_id character varying(255) NOT NULL,
    year_month character varying(7) NOT NULL,
    total_hours numeric(10,2) DEFAULT 0,
    total_points integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.monthly_voice_summary OWNER TO botd_user;

--
-- Name: monthly_voice_summary_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.monthly_voice_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.monthly_voice_summary_id_seq OWNER TO botd_user;

--
-- Name: monthly_voice_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.monthly_voice_summary_id_seq OWNED BY public.monthly_voice_summary.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: botd_user
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    user_id integer,
    discord_id character varying(255) NOT NULL,
    title character varying(500) NOT NULL,
    is_complete boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    points_awarded integer DEFAULT 0
);


ALTER TABLE public.tasks OWNER TO botd_user;

--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tasks_id_seq OWNER TO botd_user;

--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: user_complete_profile; Type: MATERIALIZED VIEW; Schema: public; Owner: botd_user
--

CREATE MATERIALIZED VIEW public.user_complete_profile AS
 SELECT u.id,
    u.discord_id,
    u.username,
    u.house,
    u.total_points,
    u.weekly_points,
    u.monthly_points,
    u.all_time_points,
    u.monthly_hours,
    u.all_time_hours,
    u.current_streak,
    u.longest_streak,
    u.last_vc_date,
    u.last_monthly_reset,
    u.created_at,
    u.updated_at,
    COALESCE(dvs_today.total_minutes, 0) AS today_minutes,
    COALESCE(dvs_today.session_count, 0) AS today_sessions,
    COALESCE(dvs_today.points_earned, 0) AS today_points,
    COALESCE(dvs_month.total_minutes, (0)::bigint) AS month_minutes,
    COALESCE(dvs_month.session_count, (0)::bigint) AS month_sessions,
    COALESCE(dvs_month.points_earned, (0)::bigint) AS month_points,
    COALESCE(task_stats.total_tasks, (0)::bigint) AS total_tasks,
    COALESCE(task_stats.completed_tasks, (0)::bigint) AS completed_tasks,
    COALESCE(task_stats.pending_tasks, (0)::bigint) AS pending_tasks,
    COALESCE(task_stats.total_task_points, (0)::bigint) AS total_task_points,
        CASE
            WHEN (active_sessions.discord_id IS NOT NULL) THEN true
            ELSE false
        END AS currently_in_voice
   FROM ((((public.users u
     LEFT JOIN public.daily_voice_stats dvs_today ON ((((u.discord_id)::text = (dvs_today.discord_id)::text) AND (dvs_today.date = ((now() AT TIME ZONE 'UTC'::text))::date))))
     LEFT JOIN ( SELECT daily_voice_stats.discord_id,
            sum(daily_voice_stats.total_minutes) AS total_minutes,
            sum(daily_voice_stats.session_count) AS session_count,
            sum(daily_voice_stats.points_earned) AS points_earned
           FROM public.daily_voice_stats
          WHERE (daily_voice_stats.date >= date_trunc('month'::text, (((now() AT TIME ZONE 'UTC'::text))::date)::timestamp with time zone))
          GROUP BY daily_voice_stats.discord_id) dvs_month ON (((u.discord_id)::text = (dvs_month.discord_id)::text)))
     LEFT JOIN ( SELECT tasks.discord_id,
            count(*) AS total_tasks,
            count(*) FILTER (WHERE (tasks.is_complete = true)) AS completed_tasks,
            count(*) FILTER (WHERE (tasks.is_complete = false)) AS pending_tasks,
            COALESCE(sum(tasks.points_awarded), (0)::bigint) AS total_task_points
           FROM public.tasks
          GROUP BY tasks.discord_id) task_stats ON (((u.discord_id)::text = (task_stats.discord_id)::text)))
     LEFT JOIN ( SELECT DISTINCT vc_sessions.discord_id
           FROM public.vc_sessions
          WHERE (vc_sessions.left_at IS NULL)) active_sessions ON (((u.discord_id)::text = (active_sessions.discord_id)::text)))
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.user_complete_profile OWNER TO botd_user;

--
-- Name: user_stats_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: botd_user
--

CREATE MATERIALIZED VIEW public.user_stats_summary AS
 SELECT u.discord_id,
    u.username,
    u.house,
    u.monthly_points,
    u.monthly_hours,
    (u.all_time_points + u.monthly_points) AS total_all_time_points,
    (u.all_time_hours + u.monthly_hours) AS total_all_time_hours,
    u.current_streak,
    u.longest_streak,
    COALESCE(dvs_today.total_minutes, 0) AS today_minutes,
    COALESCE(dvs_today.session_count, 0) AS today_sessions,
    COALESCE(dvs_today.points_earned, 0) AS today_points,
    COALESCE(dvs_month.total_minutes, (0)::bigint) AS month_minutes,
    COALESCE(dvs_month.session_count, (0)::bigint) AS month_sessions,
    COALESCE(dvs_month.points_earned, (0)::bigint) AS month_points
   FROM ((public.users u
     LEFT JOIN public.daily_voice_stats dvs_today ON ((((u.discord_id)::text = (dvs_today.discord_id)::text) AND (dvs_today.date = CURRENT_DATE))))
     LEFT JOIN ( SELECT daily_voice_stats.discord_id,
            sum(daily_voice_stats.total_minutes) AS total_minutes,
            sum(daily_voice_stats.session_count) AS session_count,
            sum(daily_voice_stats.points_earned) AS points_earned
           FROM public.daily_voice_stats
          WHERE (daily_voice_stats.date >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
          GROUP BY daily_voice_stats.discord_id) dvs_month ON (((u.discord_id)::text = (dvs_month.discord_id)::text)))
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.user_stats_summary OWNER TO botd_user;

--
-- Name: user_task_summary; Type: VIEW; Schema: public; Owner: botd_user
--

CREATE VIEW public.user_task_summary AS
 SELECT discord_id,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE (is_complete = true)) AS completed_tasks,
    count(*) FILTER (WHERE (is_complete = false)) AS pending_tasks,
    COALESCE(sum(points_awarded), (0)::bigint) AS total_task_points,
    max(completed_at) AS last_task_completion
   FROM public.tasks
  GROUP BY discord_id;


ALTER VIEW public.user_task_summary OWNER TO botd_user;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO botd_user;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vc_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: botd_user
--

CREATE SEQUENCE public.vc_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vc_sessions_id_seq OWNER TO botd_user;

--
-- Name: vc_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: botd_user
--

ALTER SEQUENCE public.vc_sessions_id_seq OWNED BY public.vc_sessions.id;


--
-- Name: daily_task_stats id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_task_stats ALTER COLUMN id SET DEFAULT nextval('public.daily_task_stats_id_seq'::regclass);


--
-- Name: daily_voice_stats id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_voice_stats ALTER COLUMN id SET DEFAULT nextval('public.daily_voice_stats_id_seq'::regclass);


--
-- Name: house_monthly_summary id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.house_monthly_summary ALTER COLUMN id SET DEFAULT nextval('public.house_monthly_summary_id_seq'::regclass);


--
-- Name: houses id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.houses ALTER COLUMN id SET DEFAULT nextval('public.houses_id_seq'::regclass);


--
-- Name: monthly_voice_summary id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.monthly_voice_summary ALTER COLUMN id SET DEFAULT nextval('public.monthly_voice_summary_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vc_sessions id; Type: DEFAULT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.vc_sessions ALTER COLUMN id SET DEFAULT nextval('public.vc_sessions_id_seq'::regclass);


--
-- Data for Name: daily_task_stats; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.daily_task_stats (id, user_id, discord_id, date, tasks_added, tasks_completed, total_task_actions, created_at, updated_at) FROM stdin;
2	25076	123456789012345678	2025-06-10	1	0	1	2025-06-10 15:11:40.496161	2025-06-10 15:11:40.496161
3	25078	999888777666555444	2025-06-10	1	0	1	2025-06-10 15:12:30.228877	2025-06-10 15:12:30.228877
8	25088	test_123456	2025-06-10	1	1	2	2025-06-10 15:43:56.890628	2025-06-10 15:43:56.923204
1	1	482582333321379850	2025-06-10	2	1	3	2025-06-10 15:03:20.039958	2025-06-10 22:39:49.394135
16	1	482582333321379850	2025-06-11	2	2	4	2025-06-11 09:09:52.239581	2025-06-11 21:51:32.864767
20	1	482582333321379850	2025-06-12	0	1	1	2025-06-12 00:23:04.806186	2025-06-12 00:23:04.806186
\.


--
-- Data for Name: daily_voice_stats; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.daily_voice_stats (id, user_id, discord_id, date, total_minutes, session_count, points_earned, created_at, updated_at, archived) FROM stdin;
1	1	482582333321379850	2025-06-09	0	1	0	2025-06-09 23:51:41.660228	2025-06-09 23:51:41.660228	f
240	25069	1275451131841085691	2025-06-10	109	9	5	2025-06-10 11:49:19.506141	2025-06-11 22:18:59.914788	f
225	24157	1311455600827433012	2025-06-10	221	20	9	2025-06-10 09:09:08.198104	2025-06-11 22:18:59.914788	f
246	25070	1369408043984617632	2025-06-10	64	3	5	2025-06-10 11:55:59.711909	2025-06-11 22:18:59.914788	f
2	2177	412363199971590159	2025-06-10	12	1	0	2025-06-10 00:32:38.896564	2025-06-11 22:18:59.914788	f
224	1	482582333321379850	2025-06-10	444	23	17	2025-06-10 09:09:08.187422	2025-06-11 22:18:59.914788	f
491	1	482582333321379850	2025-06-12	5	1	0	2025-06-12 00:28:12.481982	2025-06-12 00:28:12.481982	f
492	25112	876178113657184287	2025-06-12	5	1	0	2025-06-12 00:28:12.488161	2025-06-12 00:28:12.488161	f
493	25093	1173373447221551106	2025-06-12	5	1	0	2025-06-12 00:28:12.493657	2025-06-12 00:28:12.493657	f
301	25098	1009771716811161600	2025-06-10	33	1	0	2025-06-10 18:38:53.406414	2025-06-11 22:18:59.914788	f
306	25093	1173373447221551106	2025-06-10	274	3	11	2025-06-10 21:44:26.221966	2025-06-11 22:18:59.914788	f
494	25070	1369408043984617632	2025-06-12	5	1	0	2025-06-12 00:28:12.503618	2025-06-12 00:28:12.503618	f
495	2177	412363199971590159	2025-06-12	5	1	0	2025-06-12 00:28:12.510668	2025-06-12 00:28:12.510668	f
496	25107	938345296579162173	2025-06-12	37	2	0	2025-06-12 10:47:58.436401	2025-06-12 11:01:48.365907	f
305	25099	1268809434260574220	2025-06-10	60	1	5	2025-06-10 20:38:53.379478	2025-06-11 22:18:59.914788	f
251	25072	689125485904789514	2025-06-10	152	11	7	2025-06-10 12:30:53.164001	2025-06-11 22:18:59.914788	f
277	25073	783008693905522729	2025-06-10	230	6	9	2025-06-10 13:21:37.547123	2025-06-11 22:18:59.914788	f
230	25068	797509007748497479	2025-06-10	495	24	19	2025-06-10 11:35:00.174874	2025-06-11 22:18:59.914788	f
309	25100	848780577347731476	2025-06-10	100	3	5	2025-06-10 21:44:26.246123	2025-06-11 22:18:59.914788	f
331	25099	1268809434260574220	2025-06-11	142	1	7	2025-06-11 13:00:06.931698	2025-06-12 11:26:39.21442	t
330	24157	1311455600827433012	2025-06-11	521	2	19	2025-06-11 09:30:06.930554	2025-06-12 11:26:39.21442	t
335	25073	783008693905522729	2025-06-11	92	17	5	2025-06-11 20:35:46.931814	2025-06-12 11:26:39.21442	t
431	1	482582333321379850	2025-06-11	103	10	5	2025-06-11 22:59:25.64141	2025-06-12 11:26:39.21442	t
337	25107	938345296579162173	2025-06-11	78	15	5	2025-06-11 20:35:46.943272	2025-06-12 11:26:39.21442	t
355	25093	1173373447221551106	2025-06-11	114	12	5	2025-06-11 21:18:31.312027	2025-06-12 11:26:39.21442	t
351	25069	1275451131841085691	2025-06-11	117	13	7	2025-06-11 21:14:03.047791	2025-06-12 11:26:39.21442	t
434	25070	1369408043984617632	2025-06-11	34	9	0	2025-06-11 22:59:25.666739	2025-06-12 11:26:39.21442	t
328	2177	412363199971590159	2025-06-11	153	10	7	2025-06-11 05:45:06.903818	2025-06-12 11:26:39.21442	t
329	25072	689125485904789514	2025-06-11	598	3	23	2025-06-11 06:45:06.925335	2025-06-12 11:26:39.21442	t
336	25106	936240621931356163	2025-06-11	33	3	0	2025-06-11 20:35:46.936334	2025-06-12 11:26:39.21442	t
334	25068	797509007748497479	2025-06-11	556	2	21	2025-06-11 20:35:46.927297	2025-06-12 11:26:39.21442	t
\.


--
-- Data for Name: house_monthly_summary; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.house_monthly_summary (id, house_id, house_name, year_month, total_points, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: houses; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.houses (id, name, total_points, monthly_points, all_time_points, last_monthly_reset, created_at, updated_at) FROM stdin;
2	Hufflepuff	4	10	0	2025-06-09	2025-06-09 23:38:55.802072	2025-06-11 22:18:59.914788
4	Slytherin	30	40	0	2025-06-09	2025-06-09 23:38:55.802072	2025-06-11 22:18:59.914788
1	Gryffindor	37	52	0	2025-06-09	2025-06-09 23:38:55.802072	2025-06-11 23:38:50.471289
3	Ravenclaw	57	88	0	2025-06-09	2025-06-09 23:38:55.802072	2025-06-12 00:23:04.833184
\.


--
-- Data for Name: monthly_voice_summary; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.monthly_voice_summary (id, user_id, discord_id, year_month, total_hours, total_points, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.tasks (id, user_id, discord_id, title, is_complete, created_at, completed_at, points_awarded) FROM stdin;
19643	25076	123456789012345678	Test task from diagnosis	f	2025-06-10 15:11:40.473343	\N	0
19644	25078	999888777666555444	Debug test task	f	2025-06-10 15:12:30.205359	\N	0
19649	1	482582333321379850	ssss	t	2025-06-10 16:45:48.409946	2025-06-10 22:39:49.385193	2
19651	1	482582333321379850	ss	t	2025-06-10 22:39:32.018153	2025-06-11 21:34:15.704446	2
19652	1	482582333321379850	new task	t	2025-06-11 09:09:52.233487	2025-06-11 21:51:32.817507	2
19653	1	482582333321379850	task1	t	2025-06-11 21:51:15.421809	2025-06-12 00:23:04.795225	2
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.users (id, discord_id, username, house, total_points, weekly_points, monthly_points, all_time_points, monthly_hours, all_time_hours, current_streak, longest_streak, last_vc_date, last_monthly_reset, created_at, updated_at) FROM stdin;
25099	1268809434260574220	pwasbeworking	Ravenclaw	0	0	12	0	3.37	0.00	0	1	2025-06-11	2025-06-10	2025-06-10 19:38:10.291205	2025-06-15 10:44:53.400708
25107	938345296579162173	dspacey	\N	0	0	5	0	1.94	0.05	0	0	\N	2025-06-11	2025-06-11 20:22:47.671415	2025-06-12 11:01:48.35392
24157	1311455600827433012	secondhandroses	Gryffindor	0	0	28	0	12.37	0.00	0	1	2025-06-11	2025-06-10	2025-06-10 09:06:31.356148	2025-06-15 10:44:53.400708
25106	936240621931356163	__arianna.__	\N	0	0	0	0	0.55	0.00	0	0	\N	2025-06-11	2025-06-11 20:22:47.667521	2025-06-11 22:18:59.914788
1	482582333321379850	brutualbro	Ravenclaw	0	0	30	0	9.22	0.00	0	1	2025-06-10	2025-06-09	2025-06-09 23:51:39.4378	2025-06-12 00:28:12.47946
25112	876178113657184287	georgiarose0083	\N	0	0	0	0	0.08	0.00	0	0	\N	2025-06-12	2025-06-12 00:07:45.672108	2025-06-12 00:28:12.486476
25100	848780577347731476	sheesh2940	Hufflepuff	0	0	5	0	1.67	0.00	0	0	\N	2025-06-10	2025-06-10 20:29:07.301858	2025-06-11 22:18:59.914788
25068	797509007748497479	chrissi_4404	Slytherin	0	0	40	0	17.52	0.00	0	1	2025-06-11	2025-06-10	2025-06-10 11:31:00.996035	2025-06-15 10:44:53.400708
25069	1275451131841085691	evamusic777	Gryffindor	0	0	9	0	3.78	0.00	0	1	2025-06-10	2025-06-10	2025-06-10 11:45:23.925686	2025-06-11 23:38:50.457526
25070	1369408043984617632	plempline001	Gryffindor	0	0	5	0	1.73	0.00	0	1	2025-06-10	2025-06-10	2025-06-10 11:55:54.972962	2025-06-12 00:28:12.500464
25072	689125485904789514	eszter13	Ravenclaw	0	0	30	0	12.50	0.00	0	1	2025-06-11	2025-06-10	2025-06-10 12:26:20.608424	2025-06-15 10:44:53.400708
25073	783008693905522729	maxwritingfanfics	Ravenclaw	0	0	16	0	5.39	0.00	0	1	2025-06-10	2025-06-10	2025-06-10 13:16:48.728162	2025-06-11 23:30:27.219808
25076	123456789012345678	123456789012345678	\N	0	0	0	0	0.00	0.00	0	0	\N	2025-06-10	2025-06-10 15:11:40.458345	2025-06-10 15:11:40.458345
25078	999888777666555444	999888777666555444	\N	0	0	0	0	0.00	0.00	0	0	\N	2025-06-10	2025-06-10 15:12:30.199049	2025-06-10 15:12:30.199049
25088	test_123456	test_123456	\N	0	0	0	0	0.00	0.00	0	0	\N	2025-06-10	2025-06-10 15:43:56.885944	2025-06-10 15:43:56.885944
25093	1173373447221551106	samael_star	Gryffindor	0	0	15	0	6.56	0.00	0	0	\N	2025-06-10	2025-06-10 17:34:26.419028	2025-06-12 00:28:12.492007
25098	1009771716811161600	suvvee_	\N	0	0	0	0	0.55	0.00	0	1	2025-06-10	2025-06-10	2025-06-10 18:05:29.832022	2025-06-11 22:18:59.914788
2177	412363199971590159	piniepoupi	Hufflepuff	0	0	5	0	2.84	0.00	0	1	2025-06-11	2025-06-10	2025-06-10 00:19:58.182705	2025-06-12 00:28:12.508202
\.


--
-- Data for Name: vc_sessions; Type: TABLE DATA; Schema: public; Owner: botd_user
--

COPY public.vc_sessions (id, user_id, discord_id, voice_channel_id, voice_channel_name, joined_at, left_at, duration_minutes, date, created_at, last_heartbeat, current_duration_minutes, recovery_note) FROM stdin;
1	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-09 23:51:39.485	2025-06-09 23:51:41.632	0	2025-06-09	2025-06-09 23:51:39.485785	\N	0	\N
9767	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:35:37.503	2025-06-10 11:40:31.016	4	2025-06-10	2025-06-10 11:35:37.50375	2025-06-10 11:39:37.464	3	Graceful shutdown
2	1	482582333321379850	1371458002351030272	The Study Hall	2025-06-09 23:51:41.662	2025-06-09 23:52:01.068	0	2025-06-09	2025-06-09 23:51:41.66287	\N	0	Graceful shutdown
9768	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:35:37.505	2025-06-10 11:40:31.016	4	2025-06-10	2025-06-10 11:35:37.505903	2025-06-10 11:39:37.464	3	Graceful shutdown
3	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-10 00:19:58.192	2025-06-10 00:32:38.88	12	2025-06-10	2025-06-10 00:19:58.192747	2025-06-10 00:31:36.17	11	Graceful shutdown
9754	1	482582333321379850	1186067039958347817	Activities	2025-06-10 09:04:06.84	2025-06-10 09:09:08.172	5	2025-06-10	2025-06-10 09:04:06.841076	2025-06-10 09:07:19.562	3	Graceful shutdown
9755	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 09:06:31.367	2025-06-10 09:09:08.172	2	2025-06-10	2025-06-10 09:06:31.368186	2025-06-10 09:07:19.562	0	Graceful shutdown
9756	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 09:46:34.552	2025-06-10 09:46:59.047	0	2025-06-10	2025-06-10 09:46:34.553598	\N	0	Graceful shutdown
9769	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:40:45.196	2025-06-10 11:40:59.981	0	2025-06-10	2025-06-10 11:40:45.197	\N	0	Graceful shutdown
9770	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:40:45.201	2025-06-10 11:40:59.981	0	2025-06-10	2025-06-10 11:40:45.201676	\N	0	Graceful shutdown
9771	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:40:45.206	2025-06-10 11:40:59.981	0	2025-06-10	2025-06-10 11:40:45.206612	\N	0	Graceful shutdown
9757	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 09:48:33.646	2025-06-10 10:00:18.63	11	2025-06-10	2025-06-10 09:48:33.647951	2025-06-10 09:58:33.633	9	Graceful shutdown
9758	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:06:07.264	2025-06-10 11:06:25.791	0	2025-06-10	2025-06-10 11:06:07.264565	\N	0	Graceful shutdown
9759	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:08:43.803	2025-06-10 11:12:53.898	4	2025-06-10	2025-06-10 11:08:43.803686	2025-06-10 11:12:43.776	3	Graceful shutdown
9760	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:11:43.839	2025-06-10 11:12:53.898	1	2025-06-10	2025-06-10 11:11:43.839386	2025-06-10 11:12:43.776	0	Graceful shutdown
9761	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:19:18.327	2025-06-10 11:19:33.623	0	2025-06-10	2025-06-10 11:19:18.328004	\N	0	Graceful shutdown
9762	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:19:18.332	2025-06-10 11:19:33.623	0	2025-06-10	2025-06-10 11:19:18.333119	\N	0	Graceful shutdown
9777	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:46:22.922	2025-06-10 11:49:19.447	2	2025-06-10	2025-06-10 11:46:22.923303	2025-06-10 11:48:22.879	1	Graceful shutdown
9778	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 11:46:22.927	2025-06-10 11:49:19.447	2	2025-06-10	2025-06-10 11:46:22.928926	2025-06-10 11:48:22.879	1	Graceful shutdown
9779	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:46:22.931	2025-06-10 11:49:19.447	2	2025-06-10	2025-06-10 11:46:22.931738	2025-06-10 11:48:22.879	1	Graceful shutdown
9763	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:31:00.991	2025-06-10 11:35:00.104	3	2025-06-10	2025-06-10 11:31:00.992481	2025-06-10 11:33:00.954	1	Graceful shutdown
9764	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:31:00.997	2025-06-10 11:35:00.104	3	2025-06-10	2025-06-10 11:31:00.997326	2025-06-10 11:33:00.954	1	Graceful shutdown
9765	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:31:01	2025-06-10 11:35:00.104	3	2025-06-10	2025-06-10 11:31:01.001048	2025-06-10 11:33:00.954	1	Graceful shutdown
9793	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:26:20.617	2025-06-10 12:30:53.101	4	2025-06-10	2025-06-10 12:26:20.617433	2025-06-10 12:29:04.077	2	\N
9766	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:35:37.501	2025-06-10 11:40:31.016	4	2025-06-10	2025-06-10 11:35:37.501352	2025-06-10 11:39:37.464	3	Graceful shutdown
9772	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:41:09.937	2025-06-10 11:45:52.181	4	2025-06-10	2025-06-10 11:41:09.939389	2025-06-10 11:45:09.897	3	Graceful shutdown
9773	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:41:09.944	2025-06-10 11:45:52.181	4	2025-06-10	2025-06-10 11:41:09.944484	2025-06-10 11:45:09.897	3	Graceful shutdown
9774	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:41:09.947	2025-06-10 11:45:52.181	4	2025-06-10	2025-06-10 11:41:09.948273	2025-06-10 11:45:09.897	3	Graceful shutdown
9775	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 11:45:23.973	2025-06-10 11:45:52.181	0	2025-06-10	2025-06-10 11:45:23.973518	\N	0	Graceful shutdown
9784	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:53:47.631	2025-06-10 12:08:37.838	14	2025-06-10	2025-06-10 11:53:47.6314	2025-06-10 12:07:47.601	13	Graceful shutdown
9785	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:53:47.634	2025-06-10 12:08:37.838	14	2025-06-10	2025-06-10 11:53:47.634788	2025-06-10 12:07:47.601	13	Graceful shutdown
9786	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 11:53:47.636	2025-06-10 12:08:37.838	14	2025-06-10	2025-06-10 11:53:47.637163	2025-06-10 12:07:47.601	13	Graceful shutdown
9776	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:46:22.918	2025-06-10 11:49:19.447	2	2025-06-10	2025-06-10 11:46:22.919048	2025-06-10 11:48:22.879	1	Graceful shutdown
9788	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 11:55:54.982	2025-06-10 11:55:59.69	0	2025-06-10	2025-06-10 11:55:54.982403	\N	0	\N
9787	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:53:47.641	2025-06-10 12:08:37.838	14	2025-06-10	2025-06-10 11:53:47.64259	2025-06-10 12:07:47.601	13	Graceful shutdown
9780	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 11:49:39.39	2025-06-10 11:53:03.656	3	2025-06-10	2025-06-10 11:49:39.391274	2025-06-10 11:51:39.363	1	Graceful shutdown
9781	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 11:49:39.394	2025-06-10 11:53:03.656	3	2025-06-10	2025-06-10 11:49:39.394964	2025-06-10 11:51:39.363	1	Graceful shutdown
9782	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 11:49:39.396	2025-06-10 11:53:03.656	3	2025-06-10	2025-06-10 11:49:39.397119	2025-06-10 11:51:39.363	1	Graceful shutdown
9783	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 11:49:39.401	2025-06-10 11:53:03.656	3	2025-06-10	2025-06-10 11:49:39.401895	2025-06-10 11:51:39.363	1	Graceful shutdown
9795	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:43:17.889	2025-06-10 12:43:39.279	0	2025-06-10	2025-06-10 12:43:17.889888	\N	0	Graceful shutdown
9789	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:09:04.105	2025-06-10 12:32:04.077	22	2025-06-10	2025-06-10 12:09:04.105796	2025-06-10 12:27:04.077	17	Recovered from crash
9791	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:09:04.115	2025-06-10 12:32:04.077	22	2025-06-10	2025-06-10 12:09:04.116075	2025-06-10 12:27:04.077	17	Recovered from crash
9790	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:09:04.111	2025-06-10 12:32:04.077	22	2025-06-10	2025-06-10 12:09:04.111416	2025-06-10 12:27:04.077	17	Recovered from crash
9794	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:32:59.858	2025-06-10 12:48:04.079	10	2025-06-10	2025-06-10 12:32:59.85911	2025-06-10 12:43:04.079	10	Recovered from crash
9792	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:09:04.118	2025-06-10 12:32:04.077	22	2025-06-10	2025-06-10 12:09:04.118504	2025-06-10 12:27:04.077	17	Recovered from crash
9796	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:43:17.894	2025-06-10 12:43:39.279	0	2025-06-10	2025-06-10 12:43:17.894898	\N	0	Graceful shutdown
9797	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:43:17.898	2025-06-10 12:43:39.279	0	2025-06-10	2025-06-10 12:43:17.899173	\N	0	Graceful shutdown
9798	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:43:17.901	2025-06-10 12:43:39.279	0	2025-06-10	2025-06-10 12:43:17.901978	\N	0	Graceful shutdown
9799	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:43:17.904	2025-06-10 12:43:39.279	0	2025-06-10	2025-06-10 12:43:17.90559	\N	0	Graceful shutdown
9805	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:47:34.12	2025-06-10 12:53:32.617	5	2025-06-10	2025-06-10 12:47:34.121782	2025-06-10 12:51:34.09	3	Graceful shutdown
9806	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:47:34.125	2025-06-10 12:53:32.617	5	2025-06-10	2025-06-10 12:47:34.126271	2025-06-10 12:51:34.09	3	Graceful shutdown
9807	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:47:34.129	2025-06-10 12:53:32.617	5	2025-06-10	2025-06-10 12:47:34.130091	2025-06-10 12:51:34.09	3	Graceful shutdown
9808	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:47:34.132	2025-06-10 12:53:32.617	5	2025-06-10	2025-06-10 12:47:34.132484	2025-06-10 12:51:34.09	3	Graceful shutdown
9800	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:46:20.663	2025-06-10 12:46:46.983	0	2025-06-10	2025-06-10 12:46:20.663887	\N	0	Graceful shutdown
9801	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:46:20.669	2025-06-10 12:46:46.983	0	2025-06-10	2025-06-10 12:46:20.670693	\N	0	Graceful shutdown
9802	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:46:20.674	2025-06-10 12:46:46.983	0	2025-06-10	2025-06-10 12:46:20.674421	\N	0	Graceful shutdown
9803	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:46:20.676	2025-06-10 12:46:46.983	0	2025-06-10	2025-06-10 12:46:20.676396	\N	0	Graceful shutdown
9804	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:46:20.679	2025-06-10 12:46:46.983	0	2025-06-10	2025-06-10 12:46:20.680594	\N	0	Graceful shutdown
10041	25107	938345296579162173	1379583035015692349	🤫The Restricted Section	2025-06-12 10:48:09.444	2025-06-12 10:48:14.897	0	2025-06-12	2025-06-12 10:48:09.44502	\N	0	Graceful shutdown
9809	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:47:34.136	2025-06-10 12:53:32.617	5	2025-06-10	2025-06-10 12:47:34.137497	2025-06-10 12:51:34.09	3	Graceful shutdown
9828	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 13:09:03.527	2025-06-10 13:09:07.688	0	2025-06-10	2025-06-10 13:09:03.528568	\N	0	Graceful shutdown
9823	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 13:01:11.191	2025-06-10 13:03:44.205	2	2025-06-10	2025-06-10 13:01:11.191586	2025-06-10 13:03:11.138	1	\N
9810	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:53:45.759	2025-06-10 12:54:04.043	0	2025-06-10	2025-06-10 12:53:45.759785	\N	0	Graceful shutdown
9811	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:53:45.761	2025-06-10 12:54:04.043	0	2025-06-10	2025-06-10 12:53:45.762079	\N	0	Graceful shutdown
9812	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:53:45.766	2025-06-10 12:54:04.043	0	2025-06-10	2025-06-10 12:53:45.768539	\N	0	Graceful shutdown
9813	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:53:45.772	2025-06-10 12:54:04.043	0	2025-06-10	2025-06-10 12:53:45.772537	\N	0	Graceful shutdown
9814	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:53:45.774	2025-06-10 12:54:04.043	0	2025-06-10	2025-06-10 12:53:45.774724	\N	0	Graceful shutdown
9829	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 13:09:28.674	2025-06-10 13:21:37.457	12	2025-06-10	2025-06-10 13:09:28.674921	2025-06-10 13:21:28.644	11	Graceful shutdown
9830	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 13:09:28.677	2025-06-10 13:21:37.457	12	2025-06-10	2025-06-10 13:09:28.677856	2025-06-10 13:21:28.644	11	Graceful shutdown
9831	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 13:09:28.68	2025-06-10 13:21:37.457	12	2025-06-10	2025-06-10 13:09:28.680339	2025-06-10 13:21:28.644	11	Graceful shutdown
9832	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 13:09:28.682	2025-06-10 13:21:37.457	12	2025-06-10	2025-06-10 13:09:28.684354	2025-06-10 13:21:28.644	11	Graceful shutdown
9833	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 13:16:48.774	2025-06-10 13:21:37.457	4	2025-06-10	2025-06-10 13:16:48.775061	2025-06-10 13:21:28.644	4	Graceful shutdown
9820	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 13:01:11.177	2025-06-10 13:08:19.928	7	2025-06-10	2025-06-10 13:01:11.178607	2025-06-10 13:07:11.138	5	Graceful shutdown
9821	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 13:01:11.182	2025-06-10 13:08:19.928	7	2025-06-10	2025-06-10 13:01:11.183204	2025-06-10 13:07:11.138	5	Graceful shutdown
9815	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 12:55:42.793	2025-06-10 13:00:58.894	5	2025-06-10	2025-06-10 12:55:42.794557	2025-06-10 12:59:42.742	3	Graceful shutdown
9816	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 12:55:42.799	2025-06-10 13:00:58.894	5	2025-06-10	2025-06-10 12:55:42.800373	2025-06-10 12:59:42.742	3	Graceful shutdown
9817	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 12:55:42.804	2025-06-10 13:00:58.894	5	2025-06-10	2025-06-10 12:55:42.805347	2025-06-10 12:59:42.742	3	Graceful shutdown
9818	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 12:55:42.809	2025-06-10 13:00:58.894	5	2025-06-10	2025-06-10 12:55:42.810658	2025-06-10 12:59:42.742	3	Graceful shutdown
9819	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 12:55:42.815	2025-06-10 13:00:58.894	5	2025-06-10	2025-06-10 12:55:42.816425	2025-06-10 12:59:42.742	3	Graceful shutdown
9822	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 13:01:11.186	2025-06-10 13:08:19.928	7	2025-06-10	2025-06-10 13:01:11.186756	2025-06-10 13:07:11.138	5	Graceful shutdown
9824	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 13:01:11.197	2025-06-10 13:08:19.928	7	2025-06-10	2025-06-10 13:01:11.197495	2025-06-10 13:07:11.138	5	Graceful shutdown
9825	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 13:09:03.517	2025-06-10 13:09:07.688	0	2025-06-10	2025-06-10 13:09:03.518317	\N	0	Graceful shutdown
9826	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 13:09:03.521	2025-06-10 13:09:07.688	0	2025-06-10	2025-06-10 13:09:03.521747	\N	0	Graceful shutdown
9827	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 13:09:03.523	2025-06-10 13:09:07.688	0	2025-06-10	2025-06-10 13:09:03.524112	\N	0	Graceful shutdown
9834	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 13:22:16.907	2025-06-10 13:45:16.875	22	2025-06-10	2025-06-10 13:22:16.907669	2025-06-10 13:40:16.875	17	Recovered from crash
9839	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 13:35:30.426	2025-06-10 14:08:22.922	32	2025-06-10	2025-06-10 13:35:30.426702	2025-06-10 13:50:16.878	14	\N
9836	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 13:22:16.913	2025-06-10 14:12:30.413	50	2025-06-10	2025-06-10 13:22:16.914091	2025-06-10 13:40:16.875	17	\N
9835	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 13:22:16.91	2025-06-10 13:29:57.642	7	2025-06-10	2025-06-10 13:22:16.910719	2025-06-10 13:28:16.874	5	\N
9840	25069	1275451131841085691	1234206817438007357	Chill Zone	2025-06-10 14:14:14.565	2025-06-10 14:14:17.095	0	2025-06-10	2025-06-10 14:14:14.565732	2025-06-10 14:14:16.883	0	\N
9838	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 13:22:16.92	2025-06-10 13:45:16.875	22	2025-06-10	2025-06-10 13:22:16.921147	2025-06-10 13:40:16.875	17	Recovered from crash
9843	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 14:17:54.336	2025-06-10 14:18:00.796	0	2025-06-10	2025-06-10 14:17:54.336863	\N	0	Graceful shutdown
9837	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 13:22:16.917	2025-06-10 13:45:16.875	22	2025-06-10	2025-06-10 13:22:16.91851	2025-06-10 13:40:16.875	17	Recovered from crash
9841	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 14:17:54.329	2025-06-10 14:18:00.796	0	2025-06-10	2025-06-10 14:17:54.330344	\N	0	Graceful shutdown
9842	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 14:17:54.333	2025-06-10 14:18:00.796	0	2025-06-10	2025-06-10 14:17:54.333896	\N	0	Graceful shutdown
9847	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 14:37:07.224	2025-06-10 14:49:17.178	12	2025-06-10	2025-06-10 14:37:07.224518	2025-06-10 14:48:03.581	10	Graceful shutdown
9845	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 14:32:03.635	2025-06-10 14:49:17.178	17	2025-06-10	2025-06-10 14:32:03.635524	2025-06-10 14:48:03.581	15	Graceful shutdown
9846	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 14:32:03.639	2025-06-10 14:49:17.178	17	2025-06-10	2025-06-10 14:32:03.639725	2025-06-10 14:48:03.581	15	Graceful shutdown
9844	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 14:32:03.63	2025-06-10 14:49:17.178	17	2025-06-10	2025-06-10 14:32:03.630768	2025-06-10 14:48:03.581	15	Graceful shutdown
9849	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 15:02:59.109	2025-06-10 15:15:02.864	12	2025-06-10	2025-06-10 15:02:59.110322	2025-06-10 15:14:59.079	11	Graceful shutdown
9881	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 18:09:37.249	2025-06-10 19:53:53.359	104	2025-06-10	2025-06-10 18:09:37.249225	2025-06-10 19:52:56.773	103	\N
9871	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 16:38:56.783	2025-06-10 17:38:53.355	59	2025-06-10	2025-06-10 16:38:56.783566	2025-06-10 17:36:56.749	57	\N
9891	25093	1173373447221551106	1371458002351030272	The Study Hall	2025-06-10 21:53:09.758	2025-06-10 21:53:21.445	0	2025-06-10	2025-06-10 21:53:09.758622	\N	0	Graceful shutdown
9856	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 15:27:08.863	2025-06-10 15:45:42.43	18	2025-06-10	2025-06-10 15:27:08.863545	2025-06-10 15:45:08.84	17	Graceful shutdown
9857	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 15:27:08.865	2025-06-10 15:45:42.43	18	2025-06-10	2025-06-10 15:27:08.865852	2025-06-10 15:45:08.84	17	Graceful shutdown
9852	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 15:15:56.101	2025-06-10 15:26:54.547	10	2025-06-10	2025-06-10 15:15:56.102652	2025-06-10 15:25:56.045	9	Graceful shutdown
9853	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 15:15:56.106	2025-06-10 15:26:54.547	10	2025-06-10	2025-06-10 15:15:56.106925	2025-06-10 15:25:56.045	9	Graceful shutdown
9854	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 15:15:56.109	2025-06-10 15:26:54.547	10	2025-06-10	2025-06-10 15:15:56.110484	2025-06-10 15:25:56.045	9	Graceful shutdown
9855	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 15:15:56.115	2025-06-10 15:26:54.547	10	2025-06-10	2025-06-10 15:15:56.116629	2025-06-10 15:25:56.045	9	Graceful shutdown
9848	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 15:02:59.103	2025-06-10 15:15:02.864	12	2025-06-10	2025-06-10 15:02:59.104262	2025-06-10 15:14:59.079	11	Graceful shutdown
9850	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 15:02:59.112	2025-06-10 15:15:02.864	12	2025-06-10	2025-06-10 15:02:59.113292	2025-06-10 15:14:59.079	11	Graceful shutdown
9851	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 15:12:47.881	2025-06-10 15:15:02.864	2	2025-06-10	2025-06-10 15:12:47.881262	2025-06-10 15:14:59.079	2	Graceful shutdown
9858	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 15:27:08.867	2025-06-10 15:45:42.43	18	2025-06-10	2025-06-10 15:27:08.867838	2025-06-10 15:45:08.84	17	Graceful shutdown
9859	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 15:27:08.872	2025-06-10 15:45:42.43	18	2025-06-10	2025-06-10 15:27:08.87283	2025-06-10 15:45:08.84	17	Graceful shutdown
9860	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 16:19:01.426	2025-06-10 16:19:11.757	0	2025-06-10	2025-06-10 16:19:01.427158	\N	0	Graceful shutdown
9861	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 16:19:01.431	2025-06-10 16:19:11.757	0	2025-06-10	2025-06-10 16:19:01.431827	\N	0	Graceful shutdown
9862	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 16:19:01.435	2025-06-10 16:19:11.757	0	2025-06-10	2025-06-10 16:19:01.435827	\N	0	Graceful shutdown
9863	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 16:19:01.442	2025-06-10 16:19:11.757	0	2025-06-10	2025-06-10 16:19:01.444745	\N	0	Graceful shutdown
9864	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 16:19:01.448	2025-06-10 16:19:11.757	0	2025-06-10	2025-06-10 16:19:01.449023	\N	0	Graceful shutdown
9865	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 16:27:52.119	2025-06-10 16:28:01.609	0	2025-06-10	2025-06-10 16:27:52.11981	\N	0	Graceful shutdown
9866	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 16:27:52.123	2025-06-10 16:28:01.609	0	2025-06-10	2025-06-10 16:27:52.123792	\N	0	Graceful shutdown
9867	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 16:27:52.125	2025-06-10 16:28:01.609	0	2025-06-10	2025-06-10 16:27:52.126171	\N	0	Graceful shutdown
9868	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 16:27:52.128	2025-06-10 16:28:01.609	0	2025-06-10	2025-06-10 16:27:52.128816	\N	0	Graceful shutdown
9869	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 16:27:52.132	2025-06-10 16:28:01.609	0	2025-06-10	2025-06-10 16:27:52.133682	\N	0	Graceful shutdown
9870	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 16:38:56.778	2025-06-10 20:23:53.36	224	2025-06-10	2025-06-10 16:38:56.779761	2025-06-10 20:22:56.778	223	\N
9886	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 21:44:58.028	2025-06-10 21:52:57.777	7	2025-06-10	2025-06-10 21:44:58.029227	2025-06-10 21:50:57.996	5	Graceful shutdown
9887	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 21:44:58.032	2025-06-10 21:52:57.777	7	2025-06-10	2025-06-10 21:44:58.032823	2025-06-10 21:50:57.996	5	Graceful shutdown
9888	25100	848780577347731476	1371458002351030272	The Study Hall	2025-06-10 21:44:58.035	2025-06-10 21:52:57.777	7	2025-06-10	2025-06-10 21:44:58.035495	2025-06-10 21:50:57.996	5	Graceful shutdown
9874	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 16:38:56.794	2025-06-10 16:53:53.355	14	2025-06-10	2025-06-10 16:38:56.795001	2025-06-10 16:52:56.745	13	\N
9889	25093	1173373447221551106	1371458002351030272	The Study Hall	2025-06-10 21:44:58.037	2025-06-10 21:52:57.777	7	2025-06-10	2025-06-10 21:44:58.037967	2025-06-10 21:50:57.996	5	Graceful shutdown
9875	25093	1173373447221551106	1371458002351030272	The Study Hall	2025-06-10 17:34:26.466	2025-06-10 21:44:26.207	249	2025-06-10	2025-06-10 17:34:26.466428	2025-06-10 21:42:56.798	248	Graceful shutdown
9879	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 18:01:35.656	2025-06-10 21:44:26.207	222	2025-06-10	2025-06-10 18:01:35.65653	2025-06-10 21:42:56.798	221	Graceful shutdown
9873	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-10 16:38:56.791	2025-06-10 17:23:53.355	44	2025-06-10	2025-06-10 16:38:56.792277	2025-06-10 17:22:56.747	43	\N
9872	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-10 16:38:56.786	2025-06-10 17:08:53.354	29	2025-06-10	2025-06-10 16:38:56.787043	2025-06-10 17:06:56.745	27	\N
9884	25073	783008693905522729	1371458002351030272	The Study Hall	2025-06-10 20:27:50.727	2025-06-10 21:44:26.207	76	2025-06-10	2025-06-10 20:27:50.727976	2025-06-10 21:42:56.798	75	Graceful shutdown
9885	25100	848780577347731476	1371458002351030272	The Study Hall	2025-06-10 20:29:07.31	2025-06-10 21:44:26.207	75	2025-06-10	2025-06-10 20:29:07.310638	2025-06-10 21:42:56.798	73	Graceful shutdown
9880	25098	1009771716811161600	1371458002351030272	The Study Hall	2025-06-10 18:05:29.879	2025-06-10 18:38:53.356	33	2025-06-10	2025-06-10 18:05:29.879619	2025-06-10 18:36:56.759	31	\N
9892	25100	848780577347731476	1371458002351030272	The Study Hall	2025-06-10 21:55:48.325	2025-06-10 22:13:49.552	18	2025-06-10	2025-06-10 21:55:48.326439	2025-06-10 22:13:48.296	17	Graceful shutdown
9893	25093	1173373447221551106	1371458002351030272	The Study Hall	2025-06-10 21:55:48.329	2025-06-10 22:13:49.552	18	2025-06-10	2025-06-10 21:55:48.329311	2025-06-10 22:13:48.296	17	Graceful shutdown
9894	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 22:03:09.054	2025-06-10 22:13:49.552	10	2025-06-10	2025-06-10 22:03:09.0545	2025-06-10 22:13:48.296	10	Graceful shutdown
9883	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 20:09:08.749	2025-06-10 20:38:53.36	29	2025-06-10	2025-06-10 20:09:08.750019	2025-06-10 20:36:56.779	27	\N
9882	25099	1268809434260574220	1371458002351030272	The Study Hall	2025-06-10 19:38:10.337	2025-06-10 20:38:53.376	60	2025-06-10	2025-06-10 19:38:10.337745	2025-06-10 20:36:56.779	58	\N
9890	25100	848780577347731476	1371458002351030272	The Study Hall	2025-06-10 21:53:09.754	2025-06-10 21:53:21.445	0	2025-06-10	2025-06-10 21:53:09.755749	\N	0	Graceful shutdown
9895	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 22:14:42.2	2025-06-10 22:14:58.168	0	2025-06-10	2025-06-10 22:14:42.201325	\N	0	Graceful shutdown
9896	25100	848780577347731476	1371458002351030272	The Study Hall	2025-06-10 22:14:42.204	2025-06-10 22:14:58.168	0	2025-06-10	2025-06-10 22:14:42.204561	\N	0	Graceful shutdown
9897	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 22:35:18.386	2025-06-10 22:41:35.464	6	2025-06-10	2025-06-10 22:35:18.387315	2025-06-10 22:41:18.356	5	Graceful shutdown
9898	1	482582333321379850	1186067039958347817	Activities	2025-06-10 22:38:00.217	2025-06-10 22:38:09.651	0	2025-06-10	2025-06-10 22:38:00.218285	\N	0	\N
9899	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 22:38:09.671	2025-06-10 22:41:35.464	3	2025-06-10	2025-06-10 22:38:09.671244	2025-06-10 22:41:18.356	3	Graceful shutdown
9901	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 22:41:51.6	2025-06-10 22:57:47.025	15	2025-06-10	2025-06-10 22:41:51.600785	2025-06-10 22:55:51.563	13	Graceful shutdown
9929	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:07:10.485	2025-06-11 21:10:40.227	3	2025-06-11	2025-06-11 21:07:10.486042	2025-06-11 21:09:10.453	1	Graceful shutdown
9905	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 23:10:56.769	2025-06-10 23:35:03.851	24	2025-06-10	2025-06-10 23:10:56.770344	2025-06-10 23:34:56.738	23	Graceful shutdown
9906	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 23:10:56.773	2025-06-10 23:35:03.851	24	2025-06-10	2025-06-10 23:10:56.773471	2025-06-10 23:34:56.738	23	Graceful shutdown
9907	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 23:10:56.777	2025-06-10 23:35:03.851	24	2025-06-10	2025-06-10 23:10:56.778477	2025-06-10 23:34:56.738	23	Graceful shutdown
9908	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-10 23:13:09.212	2025-06-10 23:35:03.851	21	2025-06-10	2025-06-10 23:13:09.21248	2025-06-10 23:34:56.738	21	Graceful shutdown
10042	25107	938345296579162173	1379583035015692349	🤫The Restricted Section	2025-06-12 10:56:01.86	2025-06-12 10:56:12.913	0	2025-06-12	2025-06-12 10:56:01.86214	\N	0	Graceful shutdown
9900	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 22:41:51.596	2025-06-10 22:57:47.025	15	2025-06-10	2025-06-10 22:41:51.59706	2025-06-10 22:55:51.563	13	Graceful shutdown
9930	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:10:51.858	2025-06-11 21:11:41.849	0	2025-06-11	2025-06-11 21:10:51.859267	\N	0	Graceful shutdown
9931	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:10:51.866	2025-06-11 21:11:41.849	0	2025-06-11	2025-06-11 21:10:51.867228	\N	0	Graceful shutdown
9923	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:44:23.136	2025-06-11 20:57:31.46	13	2025-06-11	2025-06-11 20:44:23.137287	2025-06-11 20:56:23.542	12	Graceful shutdown
9920	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:36:08.994	2025-06-11 20:44:10.087	8	2025-06-11	2025-06-11 20:36:08.994725	2025-06-11 20:44:08.979	7	Graceful shutdown
9921	25106	936240621931356163	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:36:08.996	2025-06-11 20:44:10.087	8	2025-06-11	2025-06-11 20:36:08.997178	2025-06-11 20:44:08.979	7	Graceful shutdown
9913	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-11 11:02:54.693	2025-06-11 14:15:06.879	192	2025-06-11	2025-06-11 11:02:54.693283	2025-06-11 14:14:09.804	191	\N
9922	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:36:08.998	2025-06-11 20:44:10.087	8	2025-06-11	2025-06-11 20:36:08.998969	2025-06-11 20:44:08.979	7	Graceful shutdown
9910	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-11 04:00:09.66	2025-06-11 06:45:06.872	164	2025-06-11	2025-06-11 04:00:09.660808	2025-06-11 06:44:09.668	164	\N
9924	25106	936240621931356163	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:44:23.14	2025-06-11 20:57:31.46	13	2025-06-11	2025-06-11 20:44:23.141113	2025-06-11 20:56:23.542	12	Graceful shutdown
9902	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-10 22:58:08.647	2025-06-10 23:10:45.699	12	2025-06-10	2025-06-10 22:58:08.649303	2025-06-10 23:10:08.603	11	Graceful shutdown
9903	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-10 22:58:08.654	2025-06-10 23:10:45.699	12	2025-06-10	2025-06-10 22:58:08.655218	2025-06-10 23:10:08.603	11	Graceful shutdown
9904	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-10 23:09:57.074	2025-06-10 23:10:45.699	0	2025-06-10	2025-06-10 23:09:57.074518	2025-06-10 23:10:08.603	0	Graceful shutdown
9925	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:44:23.145	2025-06-11 20:57:31.46	13	2025-06-11	2025-06-11 20:44:23.145609	2025-06-11 20:56:23.542	12	Graceful shutdown
9911	24157	1311455600827433012	1371458002351030272	The Study Hall	2025-06-11 04:00:09.663	2025-06-11 09:30:06.876	329	2025-06-11	2025-06-11 04:00:09.663205	2025-06-11 09:28:09.715	328	\N
9914	25068	797509007748497479	1379583035015692349	🤫The Restricted Section	2025-06-11 11:35:40.777	2025-06-11 20:35:46.913	540	2025-06-11	2025-06-11 11:35:40.777331	2025-06-11 20:35:28.047	539	Graceful shutdown
9912	25099	1268809434260574220	1371458002351030272	The Study Hall	2025-06-11 10:38:00.088	2025-06-11 13:00:06.878	142	2025-06-11	2025-06-11 10:38:00.088526	2025-06-11 12:58:09.78	140	\N
9917	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:22:47.657	2025-06-11 20:35:46.913	12	2025-06-11	2025-06-11 20:22:47.658064	2025-06-11 20:35:28.047	12	Graceful shutdown
9918	25106	936240621931356163	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:22:47.669	2025-06-11 20:35:46.913	12	2025-06-11	2025-06-11 20:22:47.669474	2025-06-11 20:35:28.047	12	Graceful shutdown
9919	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:22:47.672	2025-06-11 20:35:46.913	12	2025-06-11	2025-06-11 20:22:47.672307	2025-06-11 20:35:28.047	12	Graceful shutdown
9916	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-11 14:10:22.693	2025-06-11 20:28:28.041	378	2025-06-11	2025-06-11 14:10:22.693981	2025-06-11 20:23:28.041	373	Recovered from crash
9915	25072	689125485904789514	1371458002351030272	The Study Hall	2025-06-11 12:33:23.859	2025-06-11 13:30:06.879	56	2025-06-11	2025-06-11 12:33:23.859744	2025-06-11 13:28:09.792	54	\N
9909	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 04:00:09.653	2025-06-11 05:45:06.873	104	2025-06-11	2025-06-11 04:00:09.654258	2025-06-11 05:44:09.653	103	\N
9932	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:12:41.366	2025-06-11 21:14:03.005	1	2025-06-11	2025-06-11 21:12:41.366758	\N	0	Graceful shutdown
9926	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:58:40.525	2025-06-11 21:04:38.901	5	2025-06-11	2025-06-11 20:58:40.526013	2025-06-11 21:02:40.503	3	Graceful shutdown
9927	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 20:58:40.528	2025-06-11 21:04:38.901	5	2025-06-11	2025-06-11 20:58:40.529269	2025-06-11 21:02:40.503	3	Graceful shutdown
9933	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:12:41.371	2025-06-11 21:14:03.005	1	2025-06-11	2025-06-11 21:12:41.372918	\N	0	Graceful shutdown
9934	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-11 21:12:41.377	2025-06-11 21:14:03.005	1	2025-06-11	2025-06-11 21:12:41.377449	\N	0	Graceful shutdown
9937	25069	1275451131841085691	1371458002351030272	The Study Hall	2025-06-11 21:14:30.036	2025-06-11 21:18:13.283	3	2025-06-11	2025-06-11 21:14:30.036982	2025-06-11 21:16:30.01	1	\N
9928	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:07:10.476	2025-06-11 21:10:40.227	3	2025-06-11	2025-06-11 21:07:10.477968	2025-06-11 21:09:10.453	1	Graceful shutdown
9936	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:14:30.034	2025-06-11 21:18:31.287	4	2025-06-11	2025-06-11 21:14:30.034609	2025-06-11 21:18:30.011	3	Graceful shutdown
9939	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:18:13.299	2025-06-11 21:18:31.287	0	2025-06-11	2025-06-11 21:18:13.299979	2025-06-11 21:18:30.011	0	Graceful shutdown
9938	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:17:17.684	2025-06-11 21:18:31.287	1	2025-06-11	2025-06-11 21:17:17.684816	2025-06-11 21:18:30.011	1	Graceful shutdown
9940	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:18:43.171	2025-06-11 21:19:03.231	0	2025-06-11	2025-06-11 21:18:43.172162	\N	0	Graceful shutdown
9941	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:18:43.177	2025-06-11 21:19:03.231	0	2025-06-11	2025-06-11 21:18:43.177359	\N	0	Graceful shutdown
9942	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:18:43.179	2025-06-11 21:19:03.231	0	2025-06-11	2025-06-11 21:18:43.179659	\N	0	Graceful shutdown
9935	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:14:30.029	2025-06-11 21:18:31.287	4	2025-06-11	2025-06-11 21:14:30.030505	2025-06-11 21:18:30.011	3	Graceful shutdown
9943	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:18:43.182	2025-06-11 21:19:03.231	0	2025-06-11	2025-06-11 21:18:43.182473	\N	0	Graceful shutdown
9944	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:25:27.437	2025-06-11 21:33:44.985	8	2025-06-11	2025-06-11 21:25:27.438193	2025-06-11 21:33:27.417	7	Graceful shutdown
9945	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:25:27.441	2025-06-11 21:33:44.985	8	2025-06-11	2025-06-11 21:25:27.442159	2025-06-11 21:33:27.417	7	Graceful shutdown
9946	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:25:27.444	2025-06-11 21:33:44.985	8	2025-06-11	2025-06-11 21:25:27.444216	2025-06-11 21:33:27.417	7	Graceful shutdown
9948	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:33:56.326	2025-06-11 21:39:48.637	5	2025-06-11	2025-06-11 21:33:56.326443	2025-06-11 21:37:56.308	3	Graceful shutdown
9967	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:03:13.265	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.265863	2025-06-11 23:09:13.245	5	Graceful shutdown
9968	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:03:13.267	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.268084	2025-06-11 23:09:13.245	5	Graceful shutdown
9950	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:51:05.261	2025-06-11 22:59:25.606	68	2025-06-11	2025-06-11 21:51:05.262014	2025-06-11 22:59:05.256	67	Graceful shutdown
9951	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:51:05.264	2025-06-11 22:59:25.606	68	2025-06-11	2025-06-11 21:51:05.265269	2025-06-11 22:59:05.256	67	Graceful shutdown
9953	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 22:34:04.101	2025-06-11 22:59:25.606	25	2025-06-11	2025-06-11 22:34:04.102473	2025-06-11 22:59:05.256	25	Graceful shutdown
9947	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:33:56.321	2025-06-11 21:39:48.637	5	2025-06-11	2025-06-11 21:33:56.32195	2025-06-11 21:37:56.308	3	Graceful shutdown
9949	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 21:33:56.328	2025-06-11 21:39:48.637	5	2025-06-11	2025-06-11 21:33:56.328583	2025-06-11 21:37:56.308	3	Graceful shutdown
10043	25107	938345296579162173	1379583035015692349	🤫The Restricted Section	2025-06-12 10:57:49.228	2025-06-12 10:58:28.972	0	2025-06-12	2025-06-12 10:57:49.228777	\N	0	Recovered: Session too short
9955	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 22:41:42.733	2025-06-11 22:59:25.606	17	2025-06-11	2025-06-11 22:41:42.733863	2025-06-11 22:59:05.256	17	Graceful shutdown
9956	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 22:52:02.463	2025-06-11 22:59:25.606	7	2025-06-11	2025-06-11 22:52:02.463227	2025-06-11 22:59:05.256	7	Graceful shutdown
9957	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-11 22:56:41.808	2025-06-11 22:59:25.606	2	2025-06-11	2025-06-11 22:56:41.809028	2025-06-11 22:59:05.256	2	Graceful shutdown
9952	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 21:52:03.858	2025-06-11 22:38:05.253	46	2025-06-11	2025-06-11 21:52:03.858876	2025-06-11 22:33:05.253	41	Recovered from crash
10045	25073	783008693905522729	1379583035015692349	🤫The Restricted Section	2025-06-15 10:54:44.128	\N	0	2025-06-15	2025-06-15 10:54:44.128431	2025-06-15 11:34:48.38	40	\N
10046	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-15 11:20:55.14	\N	0	2025-06-15	2025-06-15 11:20:55.140523	2025-06-15 11:34:48.38	13	\N
9954	25068	797509007748497479	1234206817438007357	Chill Zone	2025-06-11 22:34:12.575	2025-06-11 22:51:02.102	16	2025-06-11	2025-06-11 22:34:12.575435	2025-06-11 22:49:05.256	14	\N
9969	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:03:13.27	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.270723	2025-06-11 23:09:13.245	5	Graceful shutdown
9970	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:03:13.274	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.274937	2025-06-11 23:09:13.245	5	Graceful shutdown
9971	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:03:13.277	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.2777	2025-06-11 23:09:13.245	5	Graceful shutdown
9972	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:03:13.279	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.280093	2025-06-11 23:09:13.245	5	Graceful shutdown
9964	25070	1369408043984617632	1371458002351030272	The Study Hall	2025-06-11 22:59:41.712	2025-06-11 23:02:55.078	3	2025-06-11	2025-06-11 22:59:41.713024	2025-06-11 23:01:41.695	1	\N
9958	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 22:59:41.698	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.698292	2025-06-11 23:01:41.695	1	Graceful shutdown
9959	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 22:59:41.701	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.701271	2025-06-11 23:01:41.695	1	Graceful shutdown
9960	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 22:59:41.703	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.703996	2025-06-11 23:01:41.695	1	Graceful shutdown
9961	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 22:59:41.706	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.706672	2025-06-11 23:01:41.695	1	Graceful shutdown
9962	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 22:59:41.708	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.709076	2025-06-11 23:01:41.695	1	Graceful shutdown
9963	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 22:59:41.71	2025-06-11 23:02:57.285	3	2025-06-11	2025-06-11 22:59:41.711015	2025-06-11 23:01:41.695	1	Graceful shutdown
9965	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:02:55.094	2025-06-11 23:02:57.285	0	2025-06-11	2025-06-11 23:02:55.094382	\N	0	Graceful shutdown
9973	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:10:17.209	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.210419	\N	0	Graceful shutdown
9974	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:10:17.217	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.217881	\N	0	Graceful shutdown
9980	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:11:54.523	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.524795	\N	0	Recovered from crash
9981	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:11:54.532	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.533589	\N	0	Recovered from crash
9982	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:11:54.537	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.53773	\N	0	Recovered from crash
9983	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:11:54.54	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.541203	\N	0	Recovered from crash
9984	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:11:54.548	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.549126	\N	0	Recovered from crash
9966	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:03:13.261	2025-06-11 23:10:07.487	6	2025-06-11	2025-06-11 23:03:13.262335	2025-06-11 23:09:13.245	5	Graceful shutdown
9975	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:10:17.223	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.223589	\N	0	Graceful shutdown
9976	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:10:17.226	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.228232	\N	0	Graceful shutdown
9977	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:10:17.234	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.235326	\N	0	Graceful shutdown
9978	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:10:17.237	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.237809	\N	0	Graceful shutdown
9979	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:10:17.241	2025-06-11 23:11:49.254	1	2025-06-11	2025-06-11 23:10:17.242495	\N	0	Graceful shutdown
9985	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:11:54.552	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.552384	\N	0	Recovered from crash
9986	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:11:54.557	2025-06-11 23:13:11.379	1	2025-06-11	2025-06-11 23:11:54.558862	\N	0	Recovered from crash
10007	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:28:28.201	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.201412	\N	0	Graceful shutdown
9987	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:13:11.444	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.444934	2025-06-11 23:25:11.443	11	Graceful shutdown
9988	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:13:11.447	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.447699	2025-06-11 23:25:11.443	11	Graceful shutdown
9989	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:13:11.449	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.449626	2025-06-11 23:25:11.443	11	Graceful shutdown
9990	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:13:11.451	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.451367	2025-06-11 23:25:11.443	11	Graceful shutdown
9991	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:13:11.453	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.453227	2025-06-11 23:25:11.443	11	Graceful shutdown
9992	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:13:11.454	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.454966	2025-06-11 23:25:11.443	11	Graceful shutdown
9993	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:13:11.456	2025-06-11 23:26:48.321	13	2025-06-11	2025-06-11 23:13:11.456763	2025-06-11 23:25:11.443	11	Graceful shutdown
9994	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:26:59.044	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.045668	\N	0	Graceful shutdown
9995	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:26:59.052	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.053017	\N	0	Graceful shutdown
9996	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:26:59.056	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.057208	\N	0	Graceful shutdown
9997	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:26:59.061	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.062034	\N	0	Graceful shutdown
9998	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:26:59.066	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.067037	\N	0	Graceful shutdown
9999	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:26:59.069	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.069606	\N	0	Graceful shutdown
10000	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:26:59.072	2025-06-11 23:28:04.693	1	2025-06-11	2025-06-11 23:26:59.07243	\N	0	Graceful shutdown
10008	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:30:35.756	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.758848	\N	0	Graceful shutdown
10009	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:30:35.762	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.763077	\N	0	Graceful shutdown
10010	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:30:35.766	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.767388	\N	0	Graceful shutdown
10011	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:30:35.772	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.773016	\N	0	Graceful shutdown
10001	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:28:28.176	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.178188	\N	0	Graceful shutdown
10002	25073	783008693905522729	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:28:28.184	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.185209	\N	0	Graceful shutdown
10003	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:28:28.188	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.188357	\N	0	Graceful shutdown
10004	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:28:28.19	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.192261	\N	0	Graceful shutdown
10005	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:28:28.196	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.196577	\N	0	Graceful shutdown
10006	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:28:28.198	2025-06-11 23:30:27.185	1	2025-06-11	2025-06-11 23:28:28.199254	\N	0	Graceful shutdown
10012	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:30:35.776	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.77677	\N	0	Graceful shutdown
10013	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:30:35.78	2025-06-11 23:30:41.78	0	2025-06-11	2025-06-11 23:30:35.780865	\N	0	Graceful shutdown
10019	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-11 23:32:17.944	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.944199	2025-06-11 23:38:17.891	5	Graceful shutdown
10023	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:07:45.682	2025-06-12 00:07:52.674	0	2025-06-12	2025-06-12 00:07:45.682615	\N	0	Graceful shutdown
10014	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-11 23:32:17.916	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.918101	2025-06-11 23:38:17.891	5	Graceful shutdown
10015	25107	938345296579162173	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:32:17.925	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.926366	2025-06-11 23:38:17.891	5	Graceful shutdown
10016	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:32:17.93	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.93069	2025-06-11 23:38:17.891	5	Graceful shutdown
10017	25069	1275451131841085691	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:32:17.933	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.934253	2025-06-11 23:38:17.891	5	Graceful shutdown
10020	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-12 00:07:45.666	2025-06-12 00:07:52.674	0	2025-06-12	2025-06-12 00:07:45.667655	\N	0	Graceful shutdown
10021	25112	876178113657184287	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:07:45.673	2025-06-12 00:07:52.674	0	2025-06-12	2025-06-12 00:07:45.673561	\N	0	Graceful shutdown
10022	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:07:45.678	2025-06-12 00:07:52.674	0	2025-06-12	2025-06-12 00:07:45.679396	\N	0	Graceful shutdown
10018	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-11 23:32:17.94	2025-06-11 23:38:50.411	6	2025-06-11	2025-06-11 23:32:17.941151	2025-06-11 23:38:17.891	5	Graceful shutdown
10024	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-12 00:07:45.684	2025-06-12 00:07:52.674	0	2025-06-12	2025-06-12 00:07:45.684786	\N	0	Graceful shutdown
10025	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-12 00:10:51.642	2025-06-12 00:11:28.551	0	2025-06-12	2025-06-12 00:10:51.643098	\N	0	Graceful shutdown
10026	25112	876178113657184287	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:10:51.646	2025-06-12 00:11:28.551	0	2025-06-12	2025-06-12 00:10:51.646895	\N	0	Graceful shutdown
10027	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:10:51.649	2025-06-12 00:11:28.551	0	2025-06-12	2025-06-12 00:10:51.649414	\N	0	Graceful shutdown
10028	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:10:51.651	2025-06-12 00:11:28.551	0	2025-06-12	2025-06-12 00:10:51.652387	\N	0	Graceful shutdown
10029	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-12 00:10:51.654	2025-06-12 00:11:28.551	0	2025-06-12	2025-06-12 00:10:51.655084	\N	0	Graceful shutdown
10031	25112	876178113657184287	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:12:46.923	2025-06-12 00:12:59.327	0	2025-06-12	2025-06-12 00:12:46.923546	\N	0	Graceful shutdown
10030	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-12 00:12:46.914	2025-06-12 00:12:59.327	0	2025-06-12	2025-06-12 00:12:46.915789	\N	0	Graceful shutdown
10032	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:12:46.925	2025-06-12 00:12:59.327	0	2025-06-12	2025-06-12 00:12:46.925702	\N	0	Graceful shutdown
10033	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:12:46.932	2025-06-12 00:12:59.327	0	2025-06-12	2025-06-12 00:12:46.933763	\N	0	Graceful shutdown
10034	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-12 00:12:46.938	2025-06-12 00:12:59.327	0	2025-06-12	2025-06-12 00:12:46.939214	\N	0	Graceful shutdown
10040	25107	938345296579162173	1379583035015692349	🤫The Restricted Section	2025-06-12 10:13:09.458	2025-06-12 10:47:58.407	34	2025-06-12	2025-06-12 10:13:09.459391	2025-06-12 10:47:09.438	33	Graceful shutdown
10044	25107	938345296579162173	1379583035015692349	🤫The Restricted Section	2025-06-12 10:58:28.999	2025-06-12 10:58:59.041	0	2025-06-12	2025-06-12 10:58:29.001088	\N	0	Graceful shutdown
10035	1	482582333321379850	1234206817438007357	Chill Zone	2025-06-12 00:22:33.445	2025-06-12 00:28:12.464	5	2025-06-12	2025-06-12 00:22:33.446902	2025-06-12 00:26:33.41	3	Graceful shutdown
10036	25112	876178113657184287	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:22:33.453	2025-06-12 00:28:12.464	5	2025-06-12	2025-06-12 00:22:33.454182	2025-06-12 00:26:33.41	3	Graceful shutdown
10037	25093	1173373447221551106	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:22:33.459	2025-06-12 00:28:12.464	5	2025-06-12	2025-06-12 00:22:33.459766	2025-06-12 00:26:33.41	3	Graceful shutdown
10038	25070	1369408043984617632	1379582292170768505	⏰ Time Turner (50/10 Pomo)	2025-06-12 00:22:33.464	2025-06-12 00:28:12.464	5	2025-06-12	2025-06-12 00:22:33.464608	2025-06-12 00:26:33.41	3	Graceful shutdown
10039	2177	412363199971590159	1371458002351030272	The Study Hall	2025-06-12 00:22:33.468	2025-06-12 00:28:12.464	5	2025-06-12	2025-06-12 00:22:33.469198	2025-06-12 00:26:33.41	3	Graceful shutdown
\.


--
-- Name: daily_task_stats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.daily_task_stats_id_seq', 20, true);


--
-- Name: daily_voice_stats_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.daily_voice_stats_id_seq', 498, true);


--
-- Name: house_monthly_summary_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.house_monthly_summary_id_seq', 1, false);


--
-- Name: houses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.houses_id_seq', 492, true);


--
-- Name: monthly_voice_summary_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.monthly_voice_summary_id_seq', 1, false);


--
-- Name: tasks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.tasks_id_seq', 19653, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.users_id_seq', 25115, true);


--
-- Name: vc_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: botd_user
--

SELECT pg_catalog.setval('public.vc_sessions_id_seq', 10046, true);


--
-- Name: daily_task_stats daily_task_stats_discord_id_date_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_task_stats
    ADD CONSTRAINT daily_task_stats_discord_id_date_key UNIQUE (discord_id, date);


--
-- Name: daily_task_stats daily_task_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_task_stats
    ADD CONSTRAINT daily_task_stats_pkey PRIMARY KEY (id);


--
-- Name: daily_voice_stats daily_voice_stats_discord_id_date_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_voice_stats
    ADD CONSTRAINT daily_voice_stats_discord_id_date_key UNIQUE (discord_id, date);


--
-- Name: daily_voice_stats daily_voice_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_voice_stats
    ADD CONSTRAINT daily_voice_stats_pkey PRIMARY KEY (id);


--
-- Name: house_monthly_summary house_monthly_summary_house_name_year_month_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.house_monthly_summary
    ADD CONSTRAINT house_monthly_summary_house_name_year_month_key UNIQUE (house_name, year_month);


--
-- Name: house_monthly_summary house_monthly_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.house_monthly_summary
    ADD CONSTRAINT house_monthly_summary_pkey PRIMARY KEY (id);


--
-- Name: houses houses_name_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.houses
    ADD CONSTRAINT houses_name_key UNIQUE (name);


--
-- Name: houses houses_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.houses
    ADD CONSTRAINT houses_pkey PRIMARY KEY (id);


--
-- Name: monthly_voice_summary monthly_voice_summary_discord_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.monthly_voice_summary
    ADD CONSTRAINT monthly_voice_summary_discord_id_year_month_key UNIQUE (discord_id, year_month);


--
-- Name: monthly_voice_summary monthly_voice_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.monthly_voice_summary
    ADD CONSTRAINT monthly_voice_summary_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: users users_discord_id_key; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_discord_id_key UNIQUE (discord_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vc_sessions vc_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.vc_sessions
    ADD CONSTRAINT vc_sessions_pkey PRIMARY KEY (id);


--
-- Name: idx_daily_task_stats_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_daily_task_stats_date ON public.daily_task_stats USING btree (date);


--
-- Name: idx_daily_task_stats_discord_id_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_daily_task_stats_discord_id_date ON public.daily_task_stats USING btree (discord_id, date);


--
-- Name: idx_daily_voice_stats_composite; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_daily_voice_stats_composite ON public.daily_voice_stats USING btree (discord_id, date DESC) INCLUDE (total_minutes, session_count, points_earned);


--
-- Name: idx_daily_voice_stats_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_daily_voice_stats_date ON public.daily_voice_stats USING btree (date);


--
-- Name: idx_daily_voice_stats_discord_id_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_daily_voice_stats_discord_id_date ON public.daily_voice_stats USING btree (discord_id, date);


--
-- Name: idx_house_monthly_summary_house_year_month; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_house_monthly_summary_house_year_month ON public.house_monthly_summary USING btree (house_name, year_month);


--
-- Name: idx_house_monthly_summary_year_month; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_house_monthly_summary_year_month ON public.house_monthly_summary USING btree (year_month);


--
-- Name: idx_monthly_voice_summary_discord_id_year_month; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_monthly_voice_summary_discord_id_year_month ON public.monthly_voice_summary USING btree (discord_id, year_month);


--
-- Name: idx_monthly_voice_summary_year_month; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_monthly_voice_summary_year_month ON public.monthly_voice_summary USING btree (year_month);


--
-- Name: idx_tasks_completion_with_age; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_completion_with_age ON public.tasks USING btree (discord_id, is_complete, created_at) INCLUDE (title, points_awarded);


--
-- Name: idx_tasks_discord_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_discord_id ON public.tasks USING btree (discord_id);


--
-- Name: idx_tasks_discord_id_complete; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_discord_id_complete ON public.tasks USING btree (discord_id, is_complete);


--
-- Name: idx_tasks_user_completion; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_user_completion ON public.tasks USING btree (discord_id, is_complete, completed_at DESC);


--
-- Name: idx_tasks_user_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);


--
-- Name: idx_tasks_user_incomplete_ordered; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_tasks_user_incomplete_ordered ON public.tasks USING btree (discord_id, created_at) WHERE (is_complete = false);


--
-- Name: idx_user_complete_profile_discord_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE UNIQUE INDEX idx_user_complete_profile_discord_id ON public.user_complete_profile USING btree (discord_id);


--
-- Name: idx_user_stats_summary_discord_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE UNIQUE INDEX idx_user_stats_summary_discord_id ON public.user_stats_summary USING btree (discord_id);


--
-- Name: idx_users_alltime_leaderboard; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_alltime_leaderboard ON public.users USING btree (((all_time_hours + monthly_hours)) DESC, ((all_time_points + monthly_points)) DESC) WHERE ((all_time_hours + monthly_hours) > (0)::numeric);


--
-- Name: idx_users_discord_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_discord_id ON public.users USING btree (discord_id);


--
-- Name: idx_users_discord_id_stats; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_discord_id_stats ON public.users USING btree (discord_id) INCLUDE (monthly_points, monthly_hours, current_streak, all_time_points, all_time_hours);


--
-- Name: idx_users_last_vc_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_last_vc_date ON public.users USING btree (last_vc_date);


--
-- Name: idx_users_leaderboard; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_leaderboard ON public.users USING btree (monthly_hours DESC, monthly_points DESC) WHERE (monthly_hours > (0)::numeric);


--
-- Name: idx_users_monthly_leaderboard; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_users_monthly_leaderboard ON public.users USING btree (monthly_hours DESC, monthly_points DESC) WHERE (monthly_hours > (0)::numeric);


--
-- Name: idx_vc_sessions_active; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_active ON public.vc_sessions USING btree (discord_id, left_at) WHERE (left_at IS NULL);


--
-- Name: idx_vc_sessions_completed_duration; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_completed_duration ON public.vc_sessions USING btree (discord_id, date, duration_minutes) WHERE ((left_at IS NOT NULL) AND (duration_minutes > 0));


--
-- Name: idx_vc_sessions_date; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_date ON public.vc_sessions USING btree (date);


--
-- Name: idx_vc_sessions_discord_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_discord_id ON public.vc_sessions USING btree (discord_id);


--
-- Name: idx_vc_sessions_user_channel_active; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_user_channel_active ON public.vc_sessions USING btree (discord_id, voice_channel_id, joined_at DESC) WHERE (left_at IS NULL);


--
-- Name: idx_vc_sessions_user_id; Type: INDEX; Schema: public; Owner: botd_user
--

CREATE INDEX idx_vc_sessions_user_id ON public.vc_sessions USING btree (user_id);


--
-- Name: daily_task_stats daily_task_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_task_stats
    ADD CONSTRAINT daily_task_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_voice_stats daily_voice_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.daily_voice_stats
    ADD CONSTRAINT daily_voice_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: house_monthly_summary house_monthly_summary_house_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.house_monthly_summary
    ADD CONSTRAINT house_monthly_summary_house_id_fkey FOREIGN KEY (house_id) REFERENCES public.houses(id) ON DELETE CASCADE;


--
-- Name: monthly_voice_summary monthly_voice_summary_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.monthly_voice_summary
    ADD CONSTRAINT monthly_voice_summary_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vc_sessions vc_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: botd_user
--

ALTER TABLE ONLY public.vc_sessions
    ADD CONSTRAINT vc_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO botd_user;


--
-- Name: user_complete_profile; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: botd_user
--

REFRESH MATERIALIZED VIEW public.user_complete_profile;


--
-- Name: user_stats_summary; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: botd_user
--

REFRESH MATERIALIZED VIEW public.user_stats_summary;


--
-- PostgreSQL database dump complete
--

