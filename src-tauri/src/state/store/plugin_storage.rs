use super::*;

impl AppStore {
    // 플러그인 데이터 관련 메서드
    pub fn get_plugin_data(&self, key: &str) -> Result<Option<Value>> {
        let guard = self.state.read();
        // 인스턴스 키는 트리에 둔 버킷을 같은 모양으로 돌려준다
        if let Some(plugin_id) = plugin_id_from_instances_storage_key(key) {
            return Ok(read_plugin_instance_bucket(&guard.data, plugin_id));
        }
        Ok(guard.data.plugin_data.get(key).cloned())
    }

    #[cfg(test)]
    pub(crate) fn set_plugin_data(
        &self,
        key: &str,
        value: Value,
    ) -> Result<AdmittedPluginStorageMutation<()>> {
        let admission = self
            .history_gate
            .admit_mutation()
            .map_err(anyhow::Error::msg)?;
        self.set_plugin_data_with_admission(key, value, admission)
    }

    pub(crate) fn set_plugin_data_with_admission(
        &self,
        key: &str,
        value: Value,
        admission: HistoryAdmissionLease,
    ) -> Result<AdmittedPluginStorageMutation<()>> {
        // canonical 배치 버킷은 revision·history·이벤트를 우회하는 일반 storage 경로로
        // 쓰거나 지울 수 없다 (namespace 전체 clear만 배치를 함께 지운다)
        if is_plugin_instances_storage_key(key) {
            return Err(anyhow!("PLUGIN_INSTANCES_KEY_RESERVED"));
        }
        let mut guard = self.lock_for_update()?;
        admission
            .revalidate_for(&self.history_gate)
            .map_err(anyhow::Error::msg)?;
        if guard.data.plugin_data.get(key) == Some(&value) {
            return Ok(AdmittedPluginStorageMutation {
                value: (),
                history_status: None,
                _admission: admission,
            });
        }
        let mut scratch = guard.data.clone();
        scratch.plugin_data.insert(key.to_string(), value);
        self.commit_locked(&mut guard, scratch, ())?;
        Ok(AdmittedPluginStorageMutation {
            value: (),
            history_status: None,
            _admission: admission,
        })
    }

    #[cfg(test)]
    pub(crate) fn remove_plugin_data(
        &self,
        key: &str,
    ) -> Result<AdmittedPluginStorageMutation<()>> {
        let admission = self
            .history_gate
            .admit_mutation()
            .map_err(anyhow::Error::msg)?;
        self.remove_plugin_data_with_admission(key, admission)
    }

    pub(crate) fn remove_plugin_data_with_admission(
        &self,
        key: &str,
        admission: HistoryAdmissionLease,
    ) -> Result<AdmittedPluginStorageMutation<()>> {
        if is_plugin_instances_storage_key(key) {
            return Err(anyhow!("PLUGIN_INSTANCES_KEY_RESERVED"));
        }
        let mut guard = self.lock_for_update()?;
        admission
            .revalidate_for(&self.history_gate)
            .map_err(anyhow::Error::msg)?;
        if !guard.data.plugin_data.contains_key(key) {
            return Ok(AdmittedPluginStorageMutation {
                value: (),
                history_status: None,
                _admission: admission,
            });
        }
        let mut scratch = guard.data.clone();
        scratch.plugin_data.remove(key);
        self.commit_locked(&mut guard, scratch, ())?;
        Ok(AdmittedPluginStorageMutation {
            value: (),
            history_status: None,
            _admission: admission,
        })
    }

    #[cfg(test)]
    pub(crate) fn clear_all_plugin_data(&self) -> Result<AdmittedPluginStorageMutation<()>> {
        let admission = self
            .history_gate
            .admit_mutation()
            .map_err(anyhow::Error::msg)?;
        self.clear_all_plugin_data_with_admission(admission)
    }

    pub(crate) fn clear_all_plugin_data_with_admission(
        &self,
        admission: HistoryAdmissionLease,
    ) -> Result<AdmittedPluginStorageMutation<()>> {
        let mut guard = self.lock_for_update()?;
        admission
            .revalidate_for(&self.history_gate)
            .map_err(anyhow::Error::msg)?;
        let plugin_history_exists = guard.history.contains_plugin_elements_for(None);
        if guard.data.plugin_data.is_empty() && plugin_instance_bucket_ids(&guard.data).is_empty() {
            let history_status = (plugin_history_exists && guard.history.invalidate_all())
                .then(|| guard.history.issue_status(self.history_gate.is_closed()));
            return Ok(AdmittedPluginStorageMutation {
                value: (),
                history_status,
                _admission: admission,
            });
        }
        let mut scratch = guard.data.clone();
        let affected_plugin_ids = plugin_instance_bucket_ids(&scratch);
        let instance_data_changed = !affected_plugin_ids.is_empty();
        let next_model_revision = instance_data_changed
            .then(|| next_plugin_model_revision(guard.plugin_model_revision))
            .transpose()
            .map_err(anyhow::Error::msg)?;
        scratch.plugin_data.clear();
        for plugin_id in &affected_plugin_ids {
            write_plugin_instance_bucket(&mut scratch, plugin_id, None);
        }
        self.commit_locked(&mut guard, scratch, ())?;
        if let Some(revision) = next_model_revision {
            guard.plugin_model_revision = revision;
        }
        let history_status = ((instance_data_changed || plugin_history_exists)
            && guard.history.invalidate_all())
        .then(|| guard.history.issue_status(self.history_gate.is_closed()));
        Ok(AdmittedPluginStorageMutation {
            value: (),
            history_status,
            _admission: admission,
        })
    }

    pub fn get_all_plugin_keys(&self) -> Result<Vec<String>> {
        let guard = self.state.read();
        // 트리에 둔 인스턴스 버킷도 옛 키로 보인다
        let mut keys = guard.data.plugin_data.keys().cloned().collect::<Vec<_>>();
        keys.extend(
            plugin_instance_bucket_ids(&guard.data)
                .iter()
                .map(|plugin_id| plugin_instances_storage_key(plugin_id)),
        );
        Ok(keys)
    }

    #[cfg(test)]
    pub(crate) fn remove_plugin_data_by_prefix(
        &self,
        prefix: &str,
    ) -> Result<AdmittedPluginStorageMutation<usize>> {
        let admission = self
            .history_gate
            .admit_mutation()
            .map_err(anyhow::Error::msg)?;
        self.remove_plugin_data_by_prefix_with_admission(prefix, admission)
    }

    pub(crate) fn remove_plugin_data_by_prefix_with_admission(
        &self,
        prefix: &str,
        admission: HistoryAdmissionLease,
    ) -> Result<AdmittedPluginStorageMutation<usize>> {
        let mut guard = self.lock_for_update()?;
        admission
            .revalidate_for(&self.history_gate)
            .map_err(anyhow::Error::msg)?;
        let namespace_plugin_id = plugin_id_from_storage_namespace_prefix(prefix);
        let plugin_history_exists = namespace_plugin_id
            .is_some_and(|plugin_id| guard.history.contains_plugin_elements_for(Some(plugin_id)));
        // 공개 storage의 개별 키는 canonical 배치와 독립이다. 다만 플러그인
        // 전체 namespace clear는 1.6.1의 "모든 데이터 삭제" 계약대로 내부
        // 배치도 함께 지운다. cache/ 같은 하위 prefix에는 적용하지 않음
        // 인스턴스 버킷은 트리에 있다 - 예전처럼 접두어가 버킷 키에 맞으면(전체 namespace 포함) 그 버킷도 지운다
        let bucket_plugin_id = plugin_id_under_prefix(prefix)
            .filter(|plugin_id| plugin_instances_storage_key(plugin_id).starts_with(prefix))
            .filter(|plugin_id| read_plugin_instance_bucket(&guard.data, plugin_id).is_some())
            .map(str::to_string);
        let mut keys = guard
            .data
            .plugin_data
            .keys()
            .filter(|key| key.starts_with(prefix))
            .cloned()
            .collect::<Vec<_>>();
        if let Some(plugin_id) = &bucket_plugin_id {
            keys.push(plugin_instances_storage_key(plugin_id));
        }
        if keys.is_empty() {
            let history_status = (plugin_history_exists && guard.history.invalidate_all())
                .then(|| guard.history.issue_status(self.history_gate.is_closed()));
            return Ok(AdmittedPluginStorageMutation {
                value: 0,
                history_status,
                _admission: admission,
            });
        }
        let affected_plugin_ids = collect_plugin_instance_ids(keys.iter().map(String::as_str));
        let instance_data_changed = !affected_plugin_ids.is_empty();
        let next_model_revision = instance_data_changed
            .then(|| next_plugin_model_revision(guard.plugin_model_revision))
            .transpose()
            .map_err(anyhow::Error::msg)?;
        let mut scratch = guard.data.clone();
        for key in &keys {
            scratch.plugin_data.remove(key);
        }
        if let Some(plugin_id) = &bucket_plugin_id {
            write_plugin_instance_bucket(&mut scratch, plugin_id, None);
        }
        self.commit_locked(&mut guard, scratch, ())?;
        if let Some(revision) = next_model_revision {
            guard.plugin_model_revision = revision;
        }
        let history_status = ((instance_data_changed || plugin_history_exists)
            && guard.history.invalidate_all())
        .then(|| guard.history.issue_status(self.history_gate.is_closed()));
        Ok(AdmittedPluginStorageMutation {
            value: keys.len(),
            history_status,
            _admission: admission,
        })
    }
}

// 접두어가 가리키는 플러그인 - `plugin_data_{id}/…`의 id (namespace 안 하위 접두어 포함)
fn plugin_id_under_prefix(prefix: &str) -> Option<&str> {
    let rest = prefix.strip_prefix(crate::state::plugin::PLUGIN_DATA_KEY_PREFIX)?;
    let (plugin_id, _) = rest.split_once('/')?;
    crate::state::plugin::validate_plugin_id(plugin_id).ok()?;
    Some(plugin_id)
}
