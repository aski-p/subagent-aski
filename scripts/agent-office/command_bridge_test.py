import json, os, sqlite3, subprocess, tempfile, unittest, uuid
from pathlib import Path
from unittest.mock import patch
import queue_bridge as bridge
import commands_test as fixtures
at=fixtures.at
from ledger import Ledger

class CommandBridgeTest(unittest.TestCase):
    def test_metadata_envelope_and_result_separation(self):
        claim={'commandId':str(uuid.uuid4()),'payloadHash':'a'*64,'leaseToken':'secret','bindingRevision':1}
        message=bridge.render_command_envelope(claim)
        self.assertIn('$agent-office-boss',message)
        self.assertIn('office.user-command.v1',message)
        self.assertNotIn('secret',message)
        self.assertNotIn('office.result-report.v1',message)

    def test_crash_before_queue_never_blindly_resends(self):
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder,0o700)
            config={'outboxPath':str(Path(folder)/'outbox'),'bossId':str(uuid.uuid4()),'bindingRevision':1,'codexExe':'/fixed/codex'}
            claim={'commandId':str(uuid.uuid4()),'payloadHash':'a'*64,'leaseToken':'synthetic-lease','bindingRevision':1}
            calls=[]
            def remote(cfg,op,data):
                calls.append(op)
                return claim if op=='command-claim' and calls.count(op)==1 else None
            with patch.object(bridge,'command_remote',side_effect=remote), patch.object(bridge,'queue_command',side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):bridge.bridge_commands_once(config)
            with patch.object(bridge,'command_remote',side_effect=remote), patch.object(bridge,'queue_command') as queue:
                result=bridge.bridge_commands_once(config)
                queue.assert_not_called()
                self.assertEqual(result['reconciled'],1)

class NativeControllerTest(unittest.TestCase):
    setUp=fixtures.CommandsTest.setUp
    data=fixtures.CommandsTest.data
    submit=fixtures.CommandsTest.submit
    receive=fixtures.CommandsTest.receive
    decision=fixtures.CommandsTest.decision
    def prepare(self, count=1):
        r=self.submit(self.data(project='catalog-project'))
        self.receive(r)
        tasks=[{'id':'task' if n==0 else 'task'+str(n),'provider':'codex'} for n in range(count)]
        checkpoints=[{'id':'work'+str(n),'taskId':t['id'],'weight':9,'bossOnly':False} for n,t in enumerate(tasks)]
        checkpoints.append({'id':'final','taskId':'task','weight':1,'bossOnly':True})
        self.decision(r,'new_task',run={'id':'run','bossId':'synthetic-boss','projectId':'catalog-project','planVersion':1},tasks=tasks,checkpoints=checkpoints)
        return r
    def test_native_intent_precedes_actual_launch_and_is_not_working(self):
        r=self.prepare()
        intent=self.boss.reserve_command_attempt(r['id'],'task','attempt')
        self.assertTrue(intent['maySpawn'])
        self.assertFalse(self.boss.reserve_command_attempt(r['id'],'task','attempt')['maySpawn'])
        self.assertEqual(self.boss.project_progress(at(3))['tasks'][0]['state'],'queued')
        self.boss.confirm_command_attempt(r['id'],'attempt','synthetic-native-child','codex',None)
        self.assertEqual(self.boss.project_progress(at(4))['tasks'][0]['state'],'working')
        self.assertEqual(self.store.receipts('owner',None)['receipts'][0]['state'],'started')
    def test_uncertain_reconciliation_and_wrong_command(self):
        r=self.prepare()
        self.boss.reserve_command_attempt(r['id'],'task','attempt')
        with self.assertRaises(ValueError):self.boss.reserve_command_attempt(r['id'],'task','other')
        self.boss.reconcile_command_attempt(r['id'],'attempt',{'status':'unknown'})
        self.assertFalse(self.boss.reserve_command_attempt(r['id'],'task','attempt')['maySpawn'])
        self.boss.reconcile_command_attempt(r['id'],'attempt',{'status':'absent','evidence':'actual native inventory checked'})
        self.assertTrue(self.boss.reserve_command_attempt(r['id'],'task','other')['maySpawn'])



class FixedControllerTest(unittest.TestCase):
    def config(self):
        return {'bossId':'00000000-0000-4000-8000-000000000001','bindingRevision':1,'sshExe':'/fixed/ssh','identityFile':'/private/key','host':'owner@node.tailtest.ts.net','pythonPath':'/usr/bin/python3','cliPath':'/private/office_cli.py','dbPath':'/private/db','capabilityFiles':{'redeem':'/private/redeem','bridge':'/private/bridge'}}
    def test_child_or_missing_thread_cannot_redeem(self):
        import boss_control as ctl
        for thread in ('','child'):
            with patch.dict(os.environ,{'CODEX_THREAD_ID':thread}),patch.object(ctl,'command_remote') as remote:
                with self.assertRaises(PermissionError):ctl.boss_operation(self.config(),'command-redeem',{})
                remote.assert_not_called()
    def test_exact_binding_revision_and_fixed_rpc(self):
        import boss_control as ctl
        cfg=self.config();data={'commandId':str(uuid.uuid4()),'payloadHash':'a'*64,'bindingRevision':1}
        with patch.dict(os.environ,{'CODEX_THREAD_ID':cfg['bossId']}),patch.object(ctl,'command_remote',return_value={'receipt':{}}) as remote:
            ctl.boss_operation(cfg,'command-redeem',data)
            self.assertNotIn('bindingRevision',remote.call_args.args[2])
            with self.assertRaises(PermissionError):ctl.boss_operation(cfg,'command-redeem',{**data,'bindingRevision':2})
    def test_ssh_hidden_and_json_stdin(self):
        import boss_control as ctl
        cfg=self.config()
        with patch.object(ctl.sys,'platform','win32'),patch.object(subprocess,'CREATE_NO_WINDOW',0x08000000,create=True):
            with patch.object(ctl,'Path',side_effect=Path):
                # The host/path checks use POSIX on this Linux synthetic runner.
                run=lambda *a,**kw: subprocess.CompletedProcess(a[0],0,'null')
                from unittest.mock import Mock
                runner=Mock(side_effect=run)
                self.assertIsNone(ctl.command_remote(cfg,'command-claim',{},runner))
                args,kw=runner.call_args
                self.assertEqual(args[0][0],'/fixed/ssh')
                self.assertFalse(kw['shell']);self.assertEqual(kw['input'],'{}')
                self.assertEqual(kw['creationflags'],0x08000000)
                self.assertNotIn('capability value',' '.join(args[0]))
    def test_payload_cannot_select_helper_or_operation(self):
        import boss_control as ctl
        with self.assertRaises(ValueError):ctl.command_remote(self.config(),'shell',{})
        with self.assertRaises(ValueError):ctl.command_remote({**self.config(),'cliPath':'/private/office;evil'},'command-claim',{})
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder,0o700);p=Path(folder)/'config';p.write_text('{}');os.chmod(p,0o644)
            with self.assertRaises(PermissionError):ctl.protected_json(str(p))

class TransportRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);os.chmod(self.tmp.name,0o700)
        self.config={'outboxPath':str(Path(self.tmp.name)/'outbox'),'bossId':str(uuid.uuid4()),'bindingRevision':1,'codexExe':'/fixed/codex'}
        self.claim={'commandId':str(uuid.uuid4()),'payloadHash':'a'*64,'leaseToken':'synthetic-lease','bindingRevision':1}
    def test_queue_only_and_windows_hidden_actual_args(self):
        from unittest.mock import Mock
        run=Mock(return_value=subprocess.CompletedProcess([],0))
        with patch.object(bridge.sys,'platform','win32'),patch.object(subprocess,'CREATE_NO_WINDOW',0x08000000,create=True),patch.object(bridge,'_require_executable'):
            self.assertEqual(bridge.queue_command(self.config,self.claim,run),'queued')
        args,kw=run.call_args
        self.assertEqual(args[0][:4],['/fixed/codex','queue','--thread',self.config['bossId']])
        self.assertFalse(kw['shell']);self.assertEqual(kw['creationflags'],0x08000000)
        self.assertIs(kw['stderr'],subprocess.DEVNULL)
        run.side_effect=subprocess.TimeoutExpired('codex',30)
        self.assertEqual(bridge.queue_command(self.config,self.claim,run),'uncertain')
    def test_send_then_crash_never_requeues(self):
        sent=[];reported=[]
        def remote(cfg,op,data):
            if op=='command-transport':reported.append(data);return {'state':'uncertain'}
            return self.claim if not sent else None
        def queue(*args):sent.append(1);raise KeyboardInterrupt()
        with patch.object(bridge,'command_remote',side_effect=remote),patch.object(bridge,'queue_command',side_effect=queue):
            with self.assertRaises(KeyboardInterrupt):bridge.bridge_commands_once(self.config)
        with patch.object(bridge,'command_remote',side_effect=remote),patch.object(bridge,'queue_command') as queue:
            bridge.bridge_commands_once(self.config);queue.assert_not_called()
        self.assertEqual(len(sent),1);self.assertEqual(reported[0]['outcome'],'uncertain')
    def test_saved_transport_event_replayed_exactly_after_lost_ack(self):
        attempts=[];sent=[]
        def remote(cfg,op,data):
            if op=='command-claim':return None if sent else self.claim
            attempts.append(data)
            if len(attempts)==1:raise subprocess.TimeoutExpired('ssh',20)
            return {'state':'queued'}
        with patch.object(bridge,'command_remote',side_effect=remote),patch.object(bridge,'queue_command',side_effect=lambda *a:sent.append(1) or 'queued'):
            with self.assertRaises(subprocess.TimeoutExpired):bridge.bridge_commands_once(self.config)
            bridge.bridge_commands_once(self.config)
        self.assertEqual(len(sent),1);self.assertEqual(attempts[0],attempts[1])
    def test_expired_fenced_update_does_not_requeue(self):
        with bridge.command_outbox(self.config) as conn:
            conn.execute("INSERT INTO command_sends VALUES(?,?,?,?,?,'sending',NULL,NULL)",(self.claim['commandId'],self.claim['leaseToken'],self.claim['payloadHash'],1,self.config['bossId']))
        def remote(cfg,op,data):
            if op=='command-transport':raise ValueError('stale_lease')
            return None
        with patch.object(bridge,'command_remote',side_effect=remote),patch.object(bridge,'queue_command') as queue:
            bridge.bridge_commands_once(self.config);queue.assert_not_called()
    def test_wrong_binding_never_queues(self):
        with patch.object(bridge,'command_remote',return_value={**self.claim,'bindingRevision':2}),patch.object(bridge,'queue_command') as queue:
            with self.assertRaises(ValueError):bridge.bridge_commands_once(self.config)
            queue.assert_not_called()

class AdmissionAndResultTest(NativeControllerTest):
    def test_reservations_share_core_four_slot_admission(self):
        r=self.prepare(5)
        for n in range(4):self.boss.reserve_command_attempt(r['id'],'task' if n==0 else 'task'+str(n),'attempt'+str(n))
        with self.assertRaisesRegex(ValueError,'admission_limit'):self.boss.reserve_command_attempt(r['id'],'task4','attempt4')
        with self.assertRaisesRegex(ValueError,'admission_limit'):self.boss.start_attempt('task4',{'id':'direct','observedProvider':'codex'})
        self.boss.confirm_command_attempt(r['id'],'attempt0','actual-child','codex',None)
        self.assertEqual(self.boss.project_progress(at(4))['tasks'][0]['state'],'working')
    def test_scoped_dispatch_cannot_forge_native_observation(self):
        r=self.prepare();self.boss.reserve_command_attempt(r['id'],'task','attempt')
        scoped=Ledger(self.db,self.caps['boss-dispatch']['capabilityFile'])
        with self.assertRaises(PermissionError):scoped.confirm_command_attempt(r['id'],'attempt','invented','codex',None)
        with self.assertRaises(ValueError):self.boss.confirm_command_attempt(r['id'],'attempt','actual','claude',None)
        self.assertEqual(self.store.receipts('owner',None)['receipts'][0]['state'],'queued')
    def test_cli_current_result_and_recovery_context(self):
        from types import SimpleNamespace
        from office_cli import command_operation
        r=self.prepare()
        a=SimpleNamespace(db=self.db,capability_file=self.caps['boss-redeem']['capabilityFile'],command='command-context')
        claim=self.store.resume(self.caps['boss-redeem'])[0]
        ctx=command_operation(a,{'commandId':r['id'],'payloadHash':claim['payloadHash']})
        self.assertEqual(ctx['plan']['tasks'],[{'id':'task','provider':'codex'}])
        self.boss.reserve_command_attempt(r['id'],'task','attempt');self.boss.confirm_command_attempt(r['id'],'attempt','child','codex',None)
        a.capability_file=str(Path(self.tmp.name)/'boss');a.command='command-result'
        self.assertEqual(command_operation(a,{'commandId':r['id'],'report':{'id':'result','runId':'run','revision':1},'planVersion':1,'attemptIds':{'task':'attempt'}}),{'registered':True})
        a.command='command-result-ack'
        with self.assertRaises(ValueError):command_operation(a,{'commandId':r['id'],'reportId':'unrelated','revision':1})
        self.assertEqual(command_operation(a,{'commandId':r['id'],'reportId':'result','revision':1}),{'acknowledged':True})
        self.assertEqual(self.store.receipts('owner',None)['receipts'][0]['state'],'started')
    def test_exact_three_claims_no_fourth_and_terminal_notice(self):
        r=self.submit()
        clock=[0];sends=[]
        with tempfile.TemporaryDirectory() as folder:
            os.chmod(folder,0o700)
            config={'outboxPath':str(Path(folder)/'outbox'),'bossId':str(uuid.uuid4()),'bindingRevision':1,'codexExe':'/fixed/codex'}
            def remote(cfg,op,data):
                if op=='command-claim':return self.store.claim(self.caps['bridge-claim'],at(clock[0]))
                return self.store.record_transport({**data,'now':at(clock[0]),'capability':self.caps['bridge-claim']})
            with patch.object(bridge,'command_remote',side_effect=remote),patch.object(bridge,'queue_command',side_effect=lambda *a:sends.append(1) or 'retry_wait'):
                for sec in (0,4,5,34,35,120,240):
                    clock[0]=sec;result=bridge.bridge_commands_once(config)
                    if sec==35:self.assertTrue(result['terminalNotice'])
            self.assertEqual(len(sends),3)
            self.assertEqual(self.store.receipts('owner',None)['receipts'][0]['state'],'failed')



class ClarificationLifecycleTest(unittest.TestCase):
    setUp=fixtures.CommandsTest.setUp
    data=fixtures.CommandsTest.data
    submit=fixtures.CommandsTest.submit
    receive=fixtures.CommandsTest.receive
    decision=fixtures.CommandsTest.decision
    reply=fixtures.CommandsTest.reply
    def test_received_answer_closes_question_and_returns_private_context_atomically(self):
        parent=self.submit(self.data('which scope?'));self.receive(parent);self.decision(parent,'needs_clarification');self.reply(parent,'clarification')
        child=self.submit(self.data('selected scope',parent=parent['id']),4)
        claim=self.store.claim(self.caps['bridge-claim'],at(4))
        result=self.store.redeem(self.caps['boss-redeem'],child['id'],claim['payloadHash'],at(5))
        self.assertEqual(result['parent']['input']['text'],'which scope?')
        self.assertEqual(result['parent']['receipt']['state'],'handled')
        self.assertIsNone(result['parent']['receipt']['runId'])
        self.assertEqual(result['receipt']['state'],'received')
        duplicate=self.store.redeem(self.caps['boss-redeem'],child['id'],claim['payloadHash'],at(6))
        self.assertEqual(duplicate['parent']['receipt']['state'],'handled')
    def test_expired_unreceived_answer_releases_parent_and_old_envelope_cannot_redeem(self):
        parent=self.submit(self.data('clarify project'));self.receive(parent);self.decision(parent,'needs_clarification');self.reply(parent,'clarification')
        child=self.submit(self.data('answer',parent=parent['id']),4)
        claim=self.store.claim(self.caps['bridge-claim'],at(4))
        self.store.purge(at(86405))
        later=self.submit(self.data('corrected answer',parent=parent['id']),86406)
        self.assertNotEqual(later['id'],child['id'])
        with self.assertRaises(fixtures.CommandError):self.store.redeem(self.caps['boss-redeem'],child['id'],claim['payloadHash'],at(86407))
        self.assertEqual(next(r['state'] for r in self.store.receipts('owner',None)['receipts'] if r['id']==parent['id']),'awaiting_input')



class ConcurrentAdmissionTest(NativeControllerTest):
    def test_five_concurrent_reservations_admit_exactly_four(self):
        import concurrent.futures
        r=self.prepare(5)
        def reserve(n):
            try:
                self.boss.reserve_command_attempt(r['id'],'task' if n==0 else 'task'+str(n),'attempt'+str(n))
                return True
            except ValueError as exc:
                self.assertEqual(str(exc),'admission_limit');return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            self.assertEqual(sum(pool.map(reserve,range(5))),4)



class ReplyQualityTest(ClarificationLifecycleTest):
    def test_short_korean_reply_word_allowed_but_exact_or_long_echo_denied(self):
        for n,(text,summary,allowed) in enumerate((('확인','확인했습니다',True),('진행률','진행률은 검증된 체크포인트를 따릅니다',True),('확인','확인',False),('long synthetic command canary','Summary: long synthetic command canary',False))):
            r=self.submit(self.data(text),n*130)
            claim=self.store.claim(self.caps['bridge-claim'],at(n*130))
            self.store.redeem(self.caps['boss-redeem'],r['id'],claim['payloadHash'],at(n*130+1))
            self.decision(r,'query',sec=n*130+2)
            reply={'commandId':r['id'],'kind':'query_answer','summary':summary,'now':at(n*130+3)}
            if allowed:self.assertEqual(self.store.write_reply(self.caps['boss-reply'],reply)['replySummary'],summary)
            else:
                with self.assertRaisesRegex(ValueError,'unsafe_reply'):self.store.write_reply(self.caps['boss-reply'],reply)



class ContinuationRetentionTest(ClarificationLifecycleTest):
    def test_active_answer_retains_bounded_context_after_parent_payload_and_receipt_purge(self):
        parent=self.submit(self.data('original scoped objective'));self.receive(parent);self.decision(parent,'needs_clarification');self.reply(parent,'clarification')
        child=self.submit(self.data('chosen detail',parent=parent['id']),4)
        claim=self.store.claim(self.caps['bridge-claim'],at(4))
        received=self.store.redeem(self.caps['boss-redeem'],child['id'],claim['payloadHash'],at(5))
        self.store.purge(at(31*86400))
        store=fixtures.CommandStore(self.db)
        recovered=store.redeem(self.caps['boss-redeem'],child['id'],claim['payloadHash'],at(31*86400+1))
        self.assertEqual(recovered['parent']['input']['text'],'original scoped objective')
        self.assertEqual(recovered['continuation'],received['continuation'])
        self.assertLess(len(json.dumps(recovered['continuation'],ensure_ascii=False).encode()),65536)
        self.decision(child,'query',sec=31*86400+2);self.reply(child,sec=31*86400+3)
        store.purge(at(39*86400))
        with store._private_transaction() as conn:
            self.assertIsNone(conn.execute('SELECT continuation_context FROM commands WHERE id=?',(child['id'],)).fetchone()[0])



class WindowsAclEnvironmentTest(unittest.TestCase):
    def test_fixed_acl_child_removes_inherited_module_path_without_mutating_parent(self):
        import boss_control as ctl
        for module_key in ('PSModulePath','PSMODULEPATH','psmodulepath'):
            with self.subTest(module_key=module_key),tempfile.TemporaryDirectory() as folder:
                config=Path(folder)/'config.json';config.write_text('{"synthetic":true}',encoding='utf-8')
                inherited={module_key:'synthetic-pwsh7-modules','SystemRoot':str(Path(folder)/'synthetic-windows'),'PATH':'synthetic-path','CODEX_THREAD_ID':'synthetic-original-thread'}
                def acl_child(argv,**options):
                    if any(k.casefold()=='psmodulepath' for k in options['env']):
                        raise subprocess.CalledProcessError(1,argv,stderr='CannotAutoloadMatchingModule')
                    return subprocess.CompletedProcess(argv,0)
                with patch.dict(os.environ,inherited),patch.object(ctl.sys,'platform','win32'),patch.object(subprocess,'CREATE_NO_WINDOW',0x08000000,create=True),patch.object(subprocess,'run',side_effect=acl_child) as child:
                    self.assertEqual(ctl.protected_json(str(config)),{'synthetic':True})
                    self.assertEqual(os.environ[module_key],'synthetic-pwsh7-modules')
                    argv=child.call_args.args[0];options=child.call_args.kwargs
                    self.assertEqual(argv[:4],[str(Path(inherited['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'),'-NoProfile','-NonInteractive','-EncodedCommand'])
                    self.assertFalse(options.get('shell',False));self.assertTrue(options['check'])
                    self.assertEqual(options['creationflags'],0x08000000);self.assertEqual(options['timeout'],10)
                    for stream in ('stdin','stdout','stderr'):self.assertIs(options[stream],subprocess.DEVNULL)
                    child_env={k.casefold():v for k,v in options['env'].items()}
                    for key in ('SystemRoot','PATH','CODEX_THREAD_ID'):self.assertEqual(child_env[key.casefold()],inherited[key])
                    self.assertEqual(options['env']['AGENT_OFFICE_ACL_PATH'],str(config))
    def test_acl_child_failure_still_rejects_before_reading_config(self):
        import boss_control as ctl
        with tempfile.TemporaryDirectory() as folder:
            config=Path(folder)/'config.json';config.write_text('{"synthetic":true}',encoding='utf-8')
            with patch.dict(os.environ,{'SystemRoot':'/synthetic/windows','PSModulePath':'synthetic-pwsh7-modules'}),patch.object(ctl.sys,'platform','win32'),patch.object(subprocess,'CREATE_NO_WINDOW',0x08000000,create=True),patch.object(subprocess,'run',side_effect=subprocess.CalledProcessError(1,'fixed-acl-child')),patch.object(Path,'open',side_effect=AssertionError('config read before ACL approval')):
                with self.assertRaises(subprocess.CalledProcessError):ctl.protected_json(str(config))

if __name__=='__main__':unittest.main()
