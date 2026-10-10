import formations from '@/components/playbook/playSequencesFormations';
import systems from '@/components/playbook/playSequencesSystems';
import actions from '@/components/playbook/playSequencesActions';
import sets from '@/components/playbook/playSequencesSets';
import special from '@/components/playbook/playSequencesSpecial';
import defense from '@/components/playbook/playSequencesDefense';
export default { ...formations, ...systems, ...actions, ...sets, ...special, ...defense };
