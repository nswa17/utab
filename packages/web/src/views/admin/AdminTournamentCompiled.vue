<template>
  <section class="stack">
    <div class="row section-header">
      <h3 class="page-title">{{ $t('大会結果レポート') }}</h3>
      <ReloadButton
        class="header-reload"
        @click="refresh"
        :target="$t('大会結果レポート')"
        :disabled="isLoading"
        :loading="isLoading"
      />
    </div>

    <div class="report-content-shell">
      <LoadingState v-if="!hasLoaded && isLoading" />
      <div v-else class="report-body">
        <p v-if="compiledStore.error" class="error">{{ compiledStore.error }}</p>

        <div v-else class="stack">
      <section class="card stack report-setup-card">
        <div class="row report-setup-head">
          <h4>{{ $t('既存レポートの選択') }}</h4>
          <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
        </div>
        <Table v-if="reportSnapshotRows.length > 0" hover striped class="report-snapshot-table">
          <thead>
            <tr>
              <th>{{ $t('作成日時') }}</th>
              <th>{{ $t('集計結果名') }}</th>
              <th>{{ $t('勝敗判定') }}</th>
              <th>{{ $t('欠損データ') }}</th>
              <th>{{ $t('重複マージ') }}</th>
              <th>{{ $t('操作') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in reportSnapshotRows" :key="row.compiledId">
              <td>{{ row.createdAtLabel }}</td>
              <td>{{ row.snapshotLabel }}</td>
              <td>{{ row.winnerPolicyLabel }}</td>
              <td>{{ row.missingDataLabel }}</td>
              <td>{{ row.mergePolicyLabel }}</td>
              <td>
                <div class="row report-snapshot-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    :disabled="row.isSelected || isLoading"
                    @click="showExistingReport(row.compiledId)"
                  >
                    {{ row.isSelected ? $t('表示中') : $t('表示') }}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    :disabled="isLoading"
                    @click="openDeleteCompiledModal(row)"
                  >
                    {{ $t('削除') }}
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </Table>
        <p v-else class="muted small">{{ $t('集計結果はまだありません。') }}</p>

        <section class="stack report-generate-block">
          <div class="row report-setup-head">
            <h4>{{ $t('新規レポート生成') }}</h4>
          </div>
          <p class="muted small">{{ $t('新規レポートを生成します。') }}</p>
          <div class="row compile-actions">
            <Button
              variant="secondary"
              @click="compileManualSaveEnabled ? runPreviewWithSource('submissions') : runCompile()"
              :disabled="isLoading || !canRunCompile"
            >
              {{ compileManualSaveEnabled ? $t('仮集計') : $t('レポート生成') }}
            </Button>
            <Button
              variant="secondary"
              @click="openForceCompileModal(compileManualSaveEnabled ? 'preview' : 'compile')"
              :disabled="isLoading || !canRunCompile"
            >
              {{ $t('強制集計') }}
            </Button>
            <Button
              v-if="compileManualSaveEnabled"
              @click="openSaveSnapshotModal"
              :disabled="isLoading || !canSavePreview"
            >
              {{ $t('集計結果を保存') }}
            </Button>
            <Button variant="secondary" @click="openRecomputeOptions">
              {{ $t('詳細設定') }}
            </Button>
          </div>
          <p v-if="compileManualSaveEnabled && compileWorkflow.previewStale" class="muted warning">
            {{ $t('設定が変更されました。保存前に仮集計を実行してください。') }}
          </p>
          <section v-if="roundSubmissionSummaries.length > 0" class="stack submission-summary-card">
            <div class="row submission-summary-header">
              <h4>{{ $t('提出状況サマリー') }}</h4>
              <div class="row submission-summary-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  @click="downloadCommentSheetCsv"
                  :disabled="commentSheetRows.length === 0"
                >
                  {{ $t('コメントシートCSV') }}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  @click="downloadParticipantCsv"
                  :disabled="participantExportRows.length === 0"
                >
                  {{ $t('参加者CSV') }}
                </Button>
              </div>
            </div>
            <Table hover striped>
              <thead>
                <tr>
                  <th>{{ $t('ラウンド') }}</th>
                  <th>Ballot</th>
                  <th>Feedback</th>
                  <th>{{ $t('操作') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="summary in roundSubmissionSummaries" :key="summary.round">
                  <td>{{ roundName(summary.round) }}</td>
                  <td>{{ summarizeSubmissionCell(summary, 'ballot') }}</td>
                  <td>{{ summarizeSubmissionCell(summary, 'feedback') }}</td>
                  <td>
                    <RouterLink :to="submissionOperationsLinkForRound(summary.round)" class="submission-link">
                      {{ $t('提出状況を確認') }}
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </Table>
          </section>
          <div v-if="isRawModeActive" class="card stack migration-guide">
            <h5>{{ $t('提出データ一本化ガイド') }}</h5>
            <ol class="migration-guide-list">
              <li>{{ $t('ラウンド運営の提出状況タブで不足提出を解消し、重複提出を整理します。') }}</li>
              <li>{{ $t('生結果での補正が必要な場合は、提出データ編集へ反映して再集計します。') }}</li>
              <li>{{ $t('提出データソースに戻して再計算し、確定した集計結果を選択して出力します。') }}</li>
            </ol>
            <div class="row migration-guide-actions">
              <RouterLink :to="submissionsOperationsLink" class="migration-guide-link">
                {{ submissionOperationsLinkLabel }}
              </RouterLink>
            </div>
          </div>
        </section>
      </section>

      <template v-if="compiled">
        <div v-if="reportUxV3Enabled" class="stack report-section-nav">
          <div class="row report-section-nav-head">
            <h4>{{ $t('レポート表示') }}</h4>
          </div>
          <div class="report-section-tabs" role="tablist" :aria-label="$t('レポートセクション')">
            <button
              v-for="section in reportSectionOptions"
              :key="section.key"
              type="button"
              class="report-section-tab"
              :class="{ active: activeReportSection === section.key }"
              role="tab"
              :aria-selected="activeReportSection === section.key"
              @click="setActiveReportSection(section.key)"
            >
              {{ section.label }}
            </button>
          </div>
        </div>

        <p v-if="isDisplayedRawSource" class="muted warning raw-source-notice">
          {{ $t('表示中の大会結果は例外モードで生成されました。') }}
        </p>

        <section v-if="showOperationsSection" class="card stack rankings-panel" :class="{ 'operations-results': reportUxV3Enabled }">
          <div class="row result-list-head">
            <h4>{{ reportUxV3Enabled ? $t('カテゴリ別順位一覧') : $t('一覧') }}</h4>
            <div class="row result-list-actions">
              <CompiledDiffBaselineSelect
                v-if="diffBaselineCompiledOptions.length > 0"
                v-model="compileDiffBaselineSelection"
                class="compile-diff-field compile-diff-field-wide"
                :label="$t('差分比較')"
                :options="diffBaselineCompiledOptions"
              />
              <span v-else class="muted small">{{ $t('基準なし') }}</span>
              <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
            </div>
          </div>
          <div v-if="showCategoryTabs" class="label-tabs ranking-category-tabs">
            <button
              v-for="label in availableLabels"
              :key="label"
              type="button"
              class="label-tab"
              :class="{ active: activeLabel === label }"
              @click="setActiveLabel(label)"
            >
              {{ labelDisplay(label) }}
            </button>
          </div>
          <div v-if="showDiffLegend" class="row diff-legend">
            <span class="diff-legend-item">
              <span class="diff-marker diff-improved">▲</span>{{ $t('改善') }}
            </span>
            <span class="diff-legend-item">
              <span class="diff-marker diff-worsened">▼</span>{{ $t('悪化') }}
            </span>
            <span class="diff-legend-item">
              <span class="diff-marker diff-unchanged">◆</span>{{ $t('変化なし') }}
            </span>
            <span class="diff-legend-item">
              <span class="diff-marker diff-new">＋</span>{{ $t('新規') }}
            </span>
            <span v-if="isDisplayedRawSource" class="raw-source-badge">{{ $t('例外モード') }}</span>
          </div>
          <div v-if="activeResults.length === 0" class="muted">{{ $t('結果がありません。') }}</div>
          <CategoryRankingTable
            v-else
            :rows="sortedActiveResults"
            :columns="tableColumns"
            identity-key="id"
            :identity-label="rankingEntityLabel"
            :row-key="rankingRowKey"
            :column-label="columnLabel"
            :sort-indicator="resultSortIndicator"
            :on-sort="setResultSort"
            :value-formatter="formatValue"
            :ranking-class="rankingTrendClass"
            :ranking-text="rankingTrendText"
            :ranking-symbol="rankingSymbolForRow"
            :ranking-delta="rankingDeltaText"
            :metric-delta="metricDeltaText"
            :plain-keys="['comments', 'judged_teams']"
            :plain-value-formatter="rankingPlainValue"
          />
          <div class="row section-download-row">
            <Button
              variant="secondary"
              class="section-download-button"
              :disabled="activeResults.length === 0"
              @click="downloadCsv"
            >
              {{ $t('CSVダウンロード') }}
            </Button>
          </div>
        </section>

        <section v-if="showFairnessSection" class="card stack">
          <template v-if="teamResults.length > 0">
          <div class="fairness-summary-grid">
            <article class="overview-item">
              <div class="row overview-status-row">
                <p class="muted small">{{ $t('サイド偏り') }}</p>
                <span
                  class="fairness-severity"
                  :class="
                    hasFairnessSideData
                      ? fairnessSeverityClass(fairnessSideSummary.severity)
                      : 'fairness-severity-low'
                  "
                >
                  {{ hasFairnessSideData ? fairnessSeverityLabel(fairnessSideSummary.severity) : $t('データ不足') }}
                </span>
              </div>
              <p class="overview-value">
                {{
                  $t('Gov勝率 {gov}%', {
                    gov: Math.round(fairnessSideSummary.govWinRate * 1000) / 10,
                  })
                }}
              </p>
              <p class="muted small">
                {{
                  $t('出場差分: {gap}%', {
                    gap: Math.round(Math.abs(fairnessSideSummary.exposureGap) * 1000) / 10,
                  })
                }}
              </p>
            </article>
            <article class="overview-item">
              <div class="row overview-status-row">
                <p class="muted small">{{ $t('対戦偏り') }}</p>
                <span
                  class="fairness-severity"
                  :class="
                    hasFairnessMatchupData
                      ? fairnessSeverityClass(fairnessMatchupSummary.severity)
                      : 'fairness-severity-low'
                  "
                >
                  {{
                    hasFairnessMatchupData ? fairnessSeverityLabel(fairnessMatchupSummary.severity) : $t('データ不足')
                  }}
                </span>
              </div>
              <p class="overview-value">
                {{
                  $t('再戦ペア {pairs} / 追加再戦 {extra}', {
                    pairs: fairnessMatchupSummary.repeatedPairs,
                    extra: fairnessMatchupSummary.extraRepeats,
                  })
                }}
              </p>
              <p class="muted small">
                {{ $t('最大再戦回数: {max}', { max: fairnessMatchupSummary.maxRepeat }) }}
              </p>
            </article>
            <article class="overview-item">
              <div class="row overview-status-row">
                <p class="muted small">{{ $t('ジャッジ担当回数') }}</p>
                <span
                  class="fairness-severity"
                  :class="
                    hasFairnessJudgeData
                      ? fairnessSeverityClass(fairnessJudgeSummary.severity)
                      : 'fairness-severity-low'
                  "
                >
                  {{
                    hasFairnessJudgeData ? fairnessSeverityLabel(fairnessJudgeSummary.severity) : $t('データ不足')
                  }}
                </span>
              </div>
              <p class="overview-value">
                {{
                  $t('担当平均 {avg}', {
                    avg: fairnessJudgeSummary.average,
                  })
                }}
              </p>
              <p class="muted small">
                {{
                  $t('最小 {min} / 最大 {max}', {
                    min: fairnessJudgeSummary.min,
                    max: fairnessJudgeSummary.max,
                  })
                }}
              </p>
            </article>
            <article class="overview-item">
              <div class="row overview-status-row">
                <p class="muted small compile-label">
                  {{ $t('ジャッジ評価') }}
                  <HelpTip :text="$t('ジャッジ評価の平均スコアの偏差を比較します。')" />
                </p>
                <span
                  class="fairness-severity"
                  :class="
                    canShowJudgeFeedbackRanking
                      ? judgeFeedbackRankingOutliers > 0
                        ? 'fairness-severity-medium'
                        : 'fairness-severity-low'
                      : 'fairness-severity-low'
                  "
                >
                  {{
                    canShowJudgeFeedbackRanking
                      ? judgeFeedbackRankingOutliers > 0
                        ? $t('要確認')
                        : $t('概ね均衡')
                      : $t('データ不足')
                  }}
                </span>
              </div>
              <p class="overview-value">
                {{ $t('偏差outlier {count}名', { count: judgeFeedbackRankingOutliers }) }}
              </p>
              <p class="muted small">{{ $t('評価スコアの相対位置を表示') }}</p>
            </article>
            <article class="overview-item">
              <div class="row overview-status-row">
                <p class="muted small compile-label">
                  {{ $t('チーム評価の厳しさ') }}
                  <HelpTip
                    :text="$t('チーム評価の平均スコアの偏差から厳しさを推定します。2試合以上で表示。')"
                  />
                </p>
                <span
                  class="fairness-severity"
                  :class="
                    judgeBallotStrictnessOutliers > 0 ? 'fairness-severity-medium' : 'fairness-severity-low'
                  "
                >
                  {{
                    canShowJudgeBallotStrictness
                      ? judgeBallotStrictnessOutliers > 0
                        ? $t('要確認')
                        : $t('概ね均衡')
                      : $t('データ不足')
                  }}
                </span>
              </div>
              <p class="overview-value">
                {{
                  $t('対象 {matches}試合 / outlier {count}名', {
                    matches: judgeBallotStrictnessTotalMatches,
                    count: judgeBallotStrictnessOutliers,
                  })
                }}
              </p>
              <p class="muted small">{{ $t('ラウンド平均との差の偏差を表示') }}</p>
            </article>
          </div>
          <section class="stack strictness-card">
            <div class="stack strictness-head">
              <h5 class="fairness-panel-title">{{ $t('ジャッジ評価') }}</h5>
            </div>
            <Table v-if="judgeFeedbackRankingPreview.length > 0" hover striped>
              <thead>
                <tr>
                  <th>{{ $t('名前') }}</th>
                  <th>{{ $t('試合数') }}</th>
                  <th>{{ $t('フィードバック平均') }}</th>
                  <th>{{ $t('偏差バー') }}</th>
                  <th>{{ $t('判定') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in judgeFeedbackRankingPreview" :key="`feedback-rank-${row.id}`">
                  <td>{{ adjudicatorName(row.id) }}</td>
                  <td>{{ row.matchCount }}</td>
                  <td>{{ row.average }}</td>
                  <td>
                    <div class="strictness-bar-track">
                      <span class="strictness-bar-center" />
                      <span
                        class="strictness-bar-fill"
                        :class="strictnessBarClass(row.zScore)"
                        :style="strictnessBarStyle(row.zScore)"
                      />
                    </div>
                  </td>
                  <td>
                    <span
                      class="fairness-severity"
                      :class="row.outlier ? 'fairness-severity-medium' : 'fairness-severity-low'"
                    >
                      {{ strictnessDirectionLabel(row.direction) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </Table>
            <EmptyState
              v-else
              :title="$t('ジャッジ評価データがありません')"
              :message="$t('ジャッジ評価を含めて再計算すると表示できます。')"
            />
          </section>
          <section class="stack strictness-card">
            <div class="stack strictness-head">
              <h5 class="fairness-panel-title">{{ $t('チーム評価の厳しさ') }}</h5>
              <p class="muted small strictness-subtitle">
                {{ $t('ラウンド平均との差の偏差を比較（担当したマッチによって偏りが発生します）') }}
              </p>
            </div>
            <template v-if="canShowJudgeBallotStrictness">
              <Table hover striped>
                <thead>
                  <tr>
                    <th>{{ $t('名前') }}</th>
                    <th>{{ $t('試合数') }}</th>
                    <th>{{ $t('チーム評価平均') }}</th>
                    <th>{{ $t('相対差') }}</th>
                    <th>{{ $t('偏差バー') }}</th>
                    <th>{{ $t('判定') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in judgeBallotStrictnessPreview" :key="`ballot-strict-${row.id}`">
                    <td>{{ adjudicatorName(row.id) }}</td>
                    <td>{{ row.matchCount }}</td>
                    <td>{{ row.average }}</td>
                    <td>{{ row.roundDelta }}</td>
                    <td>
                      <div class="strictness-bar-track">
                        <span class="strictness-bar-center" />
                        <span
                          class="strictness-bar-fill"
                          :class="strictnessBarClass(row.zScore)"
                          :style="strictnessBarStyle(row.zScore)"
                        />
                      </div>
                    </td>
                    <td>
                      <span
                        class="fairness-severity"
                        :class="row.outlier ? 'fairness-severity-medium' : 'fairness-severity-low'"
                      >
                        {{ strictnessDirectionLabel(row.direction) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </template>
            <EmptyState
              v-else
              :title="$t('チーム評価の厳しさデータが不足しています')"
              :message="$t('チーム評価が2試合以上あるラウンドで表示されます。')"
            />
          </section>
          <section class="stack strictness-card fairness-chart-card">
            <h5 class="fairness-panel-title">{{ $t('サイド別スコア') }}</h5>
            <SideScatter
              v-if="teamHasScores && scoreEnabledFairnessRounds.length > 0"
              :results="teamResults"
              :rounds="scoreEnabledFairnessRounds"
              :show-title="false"
            />
            <EmptyState
              v-else-if="fairnessVisualRounds.length > 0 && scoreEnabledFairnessRounds.length === 0"
              :title="$t('サイド別スコア')"
              :message="$t('このラウンドはスピーカースコアを入力しません。')"
            />
            <EmptyState
              v-else
              :title="$t('サイド別スコア')"
              :message="$t('データが不足しています。')"
            />
          </section>
          <div v-for="round in fairnessVisualRounds" :key="round.round" class="fairness-round-visual-grid">
            <div class="fairness-round-visual-card">
              <SidePieChart
                :results="teamResults"
                :round="round.round"
                :round-name="round.name"
                :total-teams="teams.teams.length"
              />
            </div>
            <div class="fairness-round-visual-card">
              <ScoreHistogram
                v-if="canShowAnalysisCharts && isSpeakerScoreEnabledRound(round.round)"
                :results="activeResults"
                :score="scoreKey"
                :round="round.round"
                :round-name="round.name"
              />
              <EmptyState
                v-else-if="!isSpeakerScoreEnabledRound(round.round)"
                :title="$t('スコアヒストグラム')"
                :message="$t('このラウンドはスピーカースコアを入力しません。')"
              />
              <EmptyState
                v-else
                :title="$t('スコアヒストグラム')"
                :message="$t('分析が利用可能な集計区分で表示されます。')"
              />
            </div>
          </div>
          </template>
          <EmptyState
            v-else
            :title="$t('公平性データがありません')"
            :message="$t('チーム集計を含めて再計算すると公平性指標を表示できます。')"
          />
          <section class="stack fairness-analysis">
            <EmptyState
              v-if="!canShowAnalysisCharts"
              :title="analysisEmptyState.title"
              :message="analysisEmptyState.message"
            />
            <template v-else>
              <FairnessAnalysisCharts
                :results="activeResults"
                :tournament="compiled"
                :score-key="scoreKey"
                :round-filter="fairnessVisualRoundNumbers"
                :show-score-range="true"
                :show-team-performance="activeLabel === 'teams'"
                :use-cards="true"
              />
            </template>
          </section>
        </section>

        <section v-if="showAnnouncementSection" class="card stack announcement-panel">
          <div class="row result-list-head">
            <h4>{{ $t('発表出力') }}</h4>
          </div>
          <div v-if="slideAvailableLabels.length > 0" class="label-tabs ranking-category-tabs">
            <button
              v-for="label in slideAvailableLabels"
              :key="`slide-${label}`"
              type="button"
              class="label-tab"
              :class="{ active: slideLabel === label }"
              @click="setSlideLabel(label)"
            >
              {{ labelDisplay(label) }}
            </button>
          </div>

          <section class="card soft stack announcement-block">
            <div class="row">
              <h4>{{ $t('スライド') }}</h4>
            </div>
            <div class="slide-settings-row">
              <div class="slide-settings-main">
                <label class="stack slide-setting-field slide-setting-field-compact">
                  <span class="muted">{{ $t('表彰枠') }}</span>
                  <input v-model.number="maxRankingRewarded" type="number" min="1" />
                </label>
                <label class="stack slide-setting-field slide-setting-field-compact">
                  <span class="muted">{{ $t('タイプ') }}</span>
                  <select v-model="slideType">
                    <option value="listed">{{ $t('一覧') }}</option>
                    <option value="single">{{ $t('個別') }}</option>
                  </select>
                </label>
                <label class="stack slide-setting-field slide-setting-field-compact">
                  <span class="muted">{{ $t('スライドスタイル') }}</span>
                  <select v-model="slideStyle">
                    <option value="pretty">{{ $t('装飾') }}</option>
                    <option value="simple">{{ $t('簡易') }}</option>
                  </select>
                </label>
                <label class="stack slide-setting-field slide-setting-field-compact">
                  <span class="muted">{{ $t('スライド言語') }}</span>
                  <select v-model="slideLanguage">
                    <option value="en">{{ $t('English') }}</option>
                    <option value="ja">{{ $t('日本語') }}</option>
                  </select>
                </label>
              </div>
              <div class="slide-settings-credits">
                <label class="stack slide-setting-field slide-setting-field-credit">
                  <span class="muted">{{ $t('左クレジット') }}</span>
                  <input v-model="slideLeftCredit" type="text" />
                </label>
                <label class="stack slide-setting-field slide-setting-field-credit">
                  <span class="muted">{{ $t('右クレジット') }}</span>
                  <input v-model="slideRightCredit" type="text" />
                </label>
              </div>
            </div>
            <Slides
              :label="slideLabel"
              :tournament="compiledWithSubPrizes"
              :entities="entities"
              :max-ranking-rewarded="maxRankingRewarded"
              :type="slideType"
              :slide-style="slideStyle"
              :language="slideLanguage"
              :left-credit="slideLeftCredit"
              :right-credit="slideRightCredit"
              :presentation-mode="true"
            />
          </section>

          <section v-if="awardCopyRows.length > 0" class="card soft stack announcement-block">
            <div class="row award-copy-toolbar">
              <h4>{{ $t('表彰コピー') }}</h4>
            </div>
            <pre class="award-copy-text">{{ awardCopyText }}</pre>
            <div class="row section-download-row">
              <Button
                variant="secondary"
                class="section-download-button"
                :disabled="awardExportRows.length === 0"
                @click="downloadAwardCsv"
              >
                {{ $t('受賞者CSV') }}
              </Button>
            </div>
          </section>
        </section>
      </template>
    </div>
      </div>
      <div
        v-if="hasLoaded && isLoading"
        class="reload-overlay"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <LoadingState />
      </div>
    </div>

    <div
      v-if="showRecomputeOptions"
      class="modal-backdrop"
      role="presentation"
      @click.self="cancelRecomputeOptions"
    >
      <div class="modal card stack report-modal recompute-modal" role="dialog" aria-modal="true">
        <div class="row report-modal-head">
          <strong>{{ $t('詳細設定') }}</strong>
          <Button variant="ghost" size="sm" @click="cancelRecomputeOptions">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <p class="muted small">
          {{ $t('必要な場合のみ詳細設定で再計算条件を変更してください。') }}
        </p>
        <div class="stack recompute-panel">
          <CompileOptionsEditor
            v-model:source-rounds="compileRounds"
            v-model:ranking-preset="rankingPriorityPreset"
            v-model:ranking-order="rankingPriorityOrder"
            v-model:winner-policy="compileWinnerPolicy"
            v-model:tie-points="compileTiePoints"
            v-model:merge-policy="compileDuplicateMergePolicy"
            v-model:poi-aggregation="compilePoiAggregation"
            v-model:best-aggregation="compileBestAggregation"
            v-model:missing-data-policy="compileMissingDataPolicy"
            :show-winner-scoring="false"
            :show-ranking-priority="false"
            :show-source-rounds="true"
            :source-round-options="sortedRounds.map((round) => ({ value: round.round, label: round.name ?? $t('ラウンド {round}', { round: round.round }) }))"
            :disabled="isLoading"
          />
        </div>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="cancelRecomputeOptions">
            {{ $t('取消') }}
          </Button>
          <Button size="sm" :disabled="isLoading" @click="applyRecomputeOptions">
            {{ $t('設定を保存') }}
          </Button>
        </div>
      </div>
    </div>

    <div
      v-if="deleteTargetCompiledId"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteCompiledModal"
    >
      <div class="modal card stack report-modal delete-compiled-modal" role="dialog" aria-modal="true">
        <div class="row report-modal-head">
          <strong>{{ $t('集計結果を削除') }}</strong>
          <Button variant="ghost" size="sm" @click="closeDeleteCompiledModal">
            {{ $t('閉じる') }}
          </Button>
        </div>
        <p class="muted">{{ $t('この集計結果を削除しますか？') }} {{ $t('削除した集計結果は元に戻せません。') }}</p>
        <p class="small">
          <strong>{{ deleteTargetSnapshotLabel }}</strong>
        </p>
        <div class="row modal-actions">
          <Button variant="ghost" size="sm" @click="closeDeleteCompiledModal">
            {{ $t('取消') }}
          </Button>
          <Button variant="danger" size="sm" :disabled="isLoading" @click="confirmDeleteCompiled">
            {{ $t('削除') }}
          </Button>
        </div>
      </div>
    </div>

    <CompileForceRunModal
      v-model:open="forceCompileModalOpen"
      v-model:missing-data-policy="forceCompileMissingDataPolicy"
      :loading="isLoading"
      @confirm="confirmForcedCompile"
    />
    <CompileSaveSnapshotModal
      v-model:open="compileWorkflow.saveModalOpen"
      v-model:snapshot-name="compileWorkflow.snapshotNameDraft"
      v-model:snapshot-memo="compileWorkflow.snapshotMemoDraft"
      :loading="isLoading"
      @confirm="saveCompiledSnapshot"
      @cancel="onSaveSnapshotModalCancel"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTournamentStore } from '@/stores/tournament'
import { useCompiledStore } from '@/stores/compiled'
import { useTeamsStore } from '@/stores/teams'
import { useAdjudicatorsStore } from '@/stores/adjudicators'
import { useSpeakersStore } from '@/stores/speakers'
import { useInstitutionsStore } from '@/stores/institutions'
import { useRoundsStore } from '@/stores/rounds'
import { useDrawsStore } from '@/stores/draws'
import { useSubmissionsStore } from '@/stores/submissions'
import LoadingState from '@/components/common/LoadingState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Button from '@/components/common/Button.vue'
import Table from '@/components/common/Table.vue'
import ReloadButton from '@/components/common/ReloadButton.vue'
import HelpTip from '@/components/common/HelpTip.vue'
import CategoryRankingTable from '@/components/common/CategoryRankingTable.vue'
import CompiledDiffBaselineSelect from '@/components/common/CompiledDiffBaselineSelect.vue'
import CompileOptionsEditor from '@/components/common/CompileOptionsEditor.vue'
import CompileForceRunModal from '@/components/common/CompileForceRunModal.vue'
import CompileSaveSnapshotModal from '@/components/common/CompileSaveSnapshotModal.vue'
import Slides from '@/components/slides/Slides.vue'
import FairnessAnalysisCharts from '@/components/mstat/FairnessAnalysisCharts.vue'
import ScoreHistogram from '@/components/mstat/ScoreHistogram.vue'
import SideScatter from '@/components/mstat/SideScatter.vue'
import SidePieChart from '@/components/mstat/SidePieChart.vue'
import { api } from '@/utils/api'
import {
  DEFAULT_COMPILE_OPTIONS,
  normalizeCompileOptions,
  type CompileSource,
  type CompileOptions,
  type CompileOptionsInput,
  type CompileRankingMetric,
} from '@/types/compiled'
import { normalizeRoundDefaults } from '@/utils/round-defaults'
import { isAdminReportsUxV3Enabled } from '@/config/feature-flags'
import {
  formatSignedDelta,
  rankingTrendSymbol,
  resolveRankingTrend,
  toFiniteNumber,
} from '@/utils/diff-indicator'
import { applyClientBaselineDiff } from '@/utils/compiled-diff'
import {
  formatCompiledSnapshotTimestamp,
  resolvePreviousCompiledId,
} from '@/utils/compiled-snapshot'
import {
  buildCommentSheetCsv,
  buildCommentSheetRows,
  type CommentSheetCsvLabels,
} from '@/utils/comment-sheet'
import {
  buildJudgeStrictnessRows,
} from '@/utils/insights'
import {
  buildAwardExportCsv,
  buildParticipantExportCsv,
  type AwardExportRowInput,
  type ParticipantExportRowInput,
} from '@/utils/certificate-export'
import {
  trackAdminReportMetric,
  type AdminReportMetric,
  type AdminReportSection,
} from '@/utils/report-telemetry'
import { includeLabelsFromRoundDetailsAny } from '@/utils/compile-include-labels'
import { useReportSlideSettings } from '@/composables/useReportSlideSettings'
import { useCompileWorkflow } from '@/composables/useCompileWorkflow'
import { trackAdminCompileWorkflowMetric } from '@/utils/compile-workflow-telemetry'
import {
  buildSubPrizeResultsFromCompiled,
  DEFAULT_SLIDE_SETTINGS,
  type SlideLanguage,
  type SlideLabel,
  type SlideStyle,
  type SlideType,
} from '@/utils/slides-presentation'

const route = useRoute()
const tournamentStore = useTournamentStore()
const compiledStore = useCompiledStore()
const teams = useTeamsStore()
const adjudicators = useAdjudicatorsStore()
const rounds = useRoundsStore()
const speakers = useSpeakersStore()
const institutions = useInstitutionsStore()
const draws = useDrawsStore()
const submissions = useSubmissionsStore()
const { t, locale } = useI18n({ useScope: 'global' })
const reportUxV3Enabled = isAdminReportsUxV3Enabled()
const compileManualSaveEnabled = true
const compileWorkflow = useCompileWorkflow('submissions')

const tournamentId = computed(() => route.params.tournamentId as string)
const currentTournament = computed(
  () => tournamentStore.tournaments.find((item) => item._id === tournamentId.value) ?? null
)
const {
  slideLabel,
  currentSlideSettings,
  setSlideLabel: persistSlideLabel,
  updateSlideSettings,
} = useReportSlideSettings(tournamentId)
const isLoading = computed(
  () =>
    compiledStore.loading ||
    tournamentStore.loading ||
    teams.loading ||
    adjudicators.loading ||
    rounds.loading ||
    speakers.loading ||
    institutions.loading ||
    draws.loading ||
    submissions.loading
)
const hasLoaded = ref(false)
const maxRankingRewarded = computed({
  get: () => currentSlideSettings.value?.maxRankingRewarded ?? 3,
  set: (value: number) => {
    updateSlideSettings(slideLabel.value, { maxRankingRewarded: value })
  },
})
const slideType = computed<SlideType>({
  get: () => currentSlideSettings.value?.type ?? 'listed',
  set: (value) => {
    updateSlideSettings(slideLabel.value, { type: value })
  },
})
const slideStyle = computed<SlideStyle>({
  get: () => currentSlideSettings.value?.style ?? DEFAULT_SLIDE_SETTINGS.style,
  set: (value) => {
    updateSlideSettings(slideLabel.value, { style: value })
  },
})
const slideLanguage = computed<SlideLanguage>({
  get: () => currentSlideSettings.value?.language ?? DEFAULT_SLIDE_SETTINGS.language,
  set: (value) => {
    updateSlideSettings(slideLabel.value, { language: value })
  },
})
const defaultSlideLeftCredit = computed(() => {
  const tournamentName = String(currentTournament.value?.name ?? '').trim()
  return tournamentName.length > 0 ? tournamentName : DEFAULT_SLIDE_SETTINGS.leftCredit
})
const slideCreditLocaleTag = computed(() => (slideLanguage.value === 'ja' ? 'ja-JP' : 'en-US'))
const defaultSlideRightCredit = computed(() => {
  const now = new Date()
  const datePart = new Intl.DateTimeFormat(slideCreditLocaleTag.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const timePart = new Intl.DateTimeFormat(slideCreditLocaleTag.value, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
  return `${datePart} ${timePart}`.trim()
})
const slideLeftCredit = computed({
  get: () => {
    const currentCredit = String(currentSlideSettings.value?.leftCredit ?? '').trim()
    if (currentCredit.length === 0 || currentCredit === DEFAULT_SLIDE_SETTINGS.leftCredit) {
      return defaultSlideLeftCredit.value
    }
    return currentCredit
  },
  set: (value: string) => {
    updateSlideSettings(slideLabel.value, { leftCredit: value })
  },
})
const slideRightCredit = computed({
  get: () => {
    const currentCredit = String(currentSlideSettings.value?.rightCredit ?? '').trim()
    return currentCredit.length > 0 ? currentCredit : defaultSlideRightCredit.value
  },
  set: (value: string) => {
    updateSlideSettings(slideLabel.value, { rightCredit: value })
  },
})
const activeReportSection = ref<ReportSectionKey>('operations')
const activeReportSectionEnteredAt = ref<number>(Date.now())
const analysisChartsReady = ref(!reportUxV3Enabled)
const activeLabel = ref<CompiledLabel>('teams')
const showRecomputeOptions = ref(false)
const forceCompileModalOpen = ref(false)
const forceCompileAction = ref<'compile' | 'preview' | 'save'>('compile')
const manualCompileSource = ref<CompileSource>('submissions')
const manualCompileOptionOverrides = ref<
  { missing_data_policy?: CompileOptions['missing_data_policy'] } | undefined
>(undefined)
const compileRounds = ref<number[]>([])
const compileExecuted = ref(false)
const resultSortKey = ref('ranking')
const resultSortDirection = ref<'asc' | 'desc'>('asc')
const sortCollator = new Intl.Collator(['ja', 'en'], { numeric: true, sensitivity: 'base' })
const rankingPriorityPreset = ref<CompileOptions['ranking_priority']['preset']>(
  DEFAULT_COMPILE_OPTIONS.ranking_priority.preset
)
const rankingPriorityOrder = ref<CompileRankingMetric[]>([
  ...DEFAULT_COMPILE_OPTIONS.ranking_priority.order,
])
const compileWinnerPolicy = ref<CompileOptions['winner_policy']>(
  DEFAULT_COMPILE_OPTIONS.winner_policy
)
const compileTiePoints = ref<number>(DEFAULT_COMPILE_OPTIONS.tie_points)
const compileDuplicateMergePolicy = ref<CompileOptions['duplicate_normalization']['merge_policy']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.merge_policy
)
const compilePoiAggregation = ref<CompileOptions['duplicate_normalization']['poi_aggregation']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.poi_aggregation
)
const compileBestAggregation = ref<CompileOptions['duplicate_normalization']['best_aggregation']>(
  DEFAULT_COMPILE_OPTIONS.duplicate_normalization.best_aggregation
)
const compileMissingDataPolicy = ref<CompileOptions['missing_data_policy']>(
  DEFAULT_COMPILE_OPTIONS.missing_data_policy
)
const forceCompileMissingDataPolicy = ref<CompileOptions['missing_data_policy']>(
  DEFAULT_COMPILE_OPTIONS.missing_data_policy
)
const recomputeSnapshot = ref<RecomputeOptionsSnapshot | null>(null)
const compileDiffBaselineSelection = ref<string>('')
const compiledHistory = ref<any[]>([])
const selectedCompiledId = ref('')
const deleteTargetCompiledId = ref('')
const deleteTargetSnapshotLabel = ref('')
const compileDefaultsHydrated = ref(false)
const compiled = computed<Record<string, any> | null>(() => {
  if (compileManualSaveEnabled && compiledStore.previewState?.preview) {
    return compiledStore.previewState.preview
  }
  return compiledStore.compiled
})
const compiledWithSubPrizes = computed<Record<string, any> | undefined>(() => {
  if (!compiled.value) return undefined
  return {
    ...compiled.value,
    compiled_poi_results: poiResults.value,
    compiled_best_results: bestResults.value,
  }
})
type RoundSummary = { round: number; name?: string }
type CompiledLabel = SlideLabel
type ReportSectionKey = AdminReportSection
type BaselineCompiledOption = {
  compiledId: string
  rounds: number[]
  createdAt?: string
  snapshotName?: string
  compileSource: CompileSource
  compileOptions: CompileOptions
}
type ReportSnapshotRow = {
  compiledId: string
  createdAtLabel: string
  snapshotLabel: string
  winnerPolicyLabel: string
  missingDataLabel: string
  mergePolicyLabel: string
  isSelected: boolean
}
type RecomputeOptionsSnapshot = {
  compileRounds: number[]
  rankingPreset: CompileOptions['ranking_priority']['preset']
  rankingOrder: CompileRankingMetric[]
  winnerPolicy: CompileOptions['winner_policy']
  tiePoints: number
  mergePolicy: CompileOptions['duplicate_normalization']['merge_policy']
  poiAggregation: CompileOptions['duplicate_normalization']['poi_aggregation']
  bestAggregation: CompileOptions['duplicate_normalization']['best_aggregation']
  missingDataPolicy: CompileOptions['missing_data_policy']
}
type FairnessSeverity = 'high' | 'medium' | 'low'
type JudgeBallotStrictnessRow = {
  id: string
  average: number
  roundDelta: number
  zScore: number
  matchCount: number
  direction: 'strict' | 'lenient' | 'neutral'
  outlier: boolean
}
type JudgeFeedbackRankingRow = {
  id: string
  average: number
  zScore: number
  matchCount: number
  direction: 'strict' | 'lenient' | 'neutral'
  outlier: boolean
}
const sortedRounds = computed<RoundSummary[]>(() => {
  if (rounds.rounds.length > 0) {
    return rounds.rounds
      .filter((round) => Number.isInteger(round.round) && round.round >= 1)
      .slice()
      .sort((a, b) => a.round - b.round)
  }
  const payloadRounds = compiled.value?.rounds ?? []
  return payloadRounds
    .map((item: any) => {
      const roundValue = item?.r ?? item?.round ?? item
      return {
        round: roundValue,
        name: item?.name ?? t('ラウンド {round}', { round: roundValue }),
      }
    })
    .filter((round: any) => Number.isInteger(round.round) && round.round >= 1)
    .sort((a: any, b: any) => a.round - b.round)
})
function normalizeRoundSelection(roundNumbers: number[]): number[] {
  return Array.from(
    new Set(
      roundNumbers
        .map((round) => Number(round))
        .filter((round) => Number.isInteger(round) && round >= 1)
    )
  ).sort((left, right) => left - right)
}
const availableCompileRoundNumbers = computed(() =>
  normalizeRoundSelection(sortedRounds.value.map((round) => round.round))
)
const teamResults = computed<any[]>(() => compiled.value?.compiled_team_results ?? [])
const teamHasScores = computed(() =>
  teamResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
)

const entities = computed(() => {
  const map: Record<string, string> = {}
  teams.teams.forEach((team) => {
    map[team._id] = team.name
  })
  speakers.speakers.forEach((speaker) => {
    map[speaker._id] = speaker.name
  })
  adjudicators.adjudicators.forEach((adj) => {
    map[adj._id] = adj.name
  })
  institutions.institutions.forEach((institution) => {
    map[institution._id] = institution.name
  })
  return map
})

const selectedCompileLabels = computed<Set<string>>(
  () => new Set(compiled.value?.compile_options?.include_labels ?? DEFAULT_COMPILE_OPTIONS.include_labels)
)
function isCompileLabelEnabled(label: 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best') {
  return selectedCompileLabels.value.has(label)
}

const availableLabels = computed(() => {
  if (!compiled.value) return ['teams']
  const labels: Array<'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'> = []
  if (isCompileLabelEnabled('teams') && compiled.value.compiled_team_results?.length) labels.push('teams')
  if (isCompileLabelEnabled('speakers') && compiled.value.compiled_speaker_results?.length) labels.push('speakers')
  if (isCompileLabelEnabled('adjudicators') && compiled.value.compiled_adjudicator_results?.length) labels.push('adjudicators')
  if (isCompileLabelEnabled('poi') && poiResults.value.length > 0) labels.push('poi')
  if (isCompileLabelEnabled('best') && bestResults.value.length > 0) labels.push('best')
  return labels.length > 0 ? labels : ['teams']
})
const slideAvailableLabels = computed(() => availableLabels.value)
const showCategoryTabs = computed(
  () => Boolean(compiled.value) && compileExecuted.value && showOperationsSection.value
)
const snapshotLocaleTag = computed(() => (locale.value === 'ja' ? 'ja-JP' : 'en-US'))
const baselineCompiledOptions = computed<BaselineCompiledOption[]>(() =>
  compiledHistory.value
    .map((item) => {
      const payload = item?.payload && typeof item.payload === 'object' ? item.payload : item
      const compileSource: CompileSource = payload?.compile_source === 'raw' ? 'raw' : 'submissions'
      const roundsValue = Array.isArray(payload?.rounds) ? payload.rounds : []
      const normalizedRounds = roundsValue
        .map((entry: any) => entry?.r ?? entry?.round ?? entry)
        .filter((value: number) => Number.isFinite(value))
      return {
        compiledId: String(item?._id ?? ''),
        rounds: normalizedRounds,
        createdAt: item?.createdAt ? String(item.createdAt) : undefined,
        snapshotName: String(payload?.snapshot_name ?? '').trim() || undefined,
        compileSource,
        compileOptions: normalizeCompileOptions(payload?.compile_options as CompileOptionsInput | undefined),
      }
    })
    .filter((item) => item.compiledId.length > 0)
)
const diffBaselineCompiledOptions = computed<BaselineCompiledOption[]>(() =>
  baselineCompiledOptions.value.filter((option) => option.compiledId !== selectedCompiledId.value)
)

function summarizeRounds(rounds: number[]): string {
  const normalized = Array.from(
    new Set(rounds.filter((round) => Number.isInteger(round) && round >= 1))
  ).sort((left, right) => left - right)
  if (normalized.length === 0) return t('未選択')
  if (normalized.length <= 3) return normalized.map((round) => `R${round}`).join(', ')
  return `R${normalized[0]}-R${normalized[normalized.length - 1]} (${normalized.length}${t('ラウンド')})`
}

function summarizeSnapshotLabel(option: BaselineCompiledOption): string {
  const snapshotName = String(option.snapshotName ?? '').trim()
  if (snapshotName.length > 0) return snapshotName
  return summarizeRounds(option.rounds)
}

function summarizeWinnerPolicy(policy: CompileOptions['winner_policy']): string {
  if (policy === 'score_only') return t('スコア推定のみ')
  if (policy === 'draw_on_missing') return t('未指定は引き分け')
  return t('winnerId優先')
}

function summarizeMissingDataPolicy(policy: CompileOptions['missing_data_policy']): string {
  if (policy === 'exclude') return t('欠損を除外')
  if (policy === 'error') return t('エラー停止')
  return t('警告のみ')
}

function summarizeMergePolicy(
  policy: CompileOptions['duplicate_normalization']['merge_policy']
): string {
  if (policy === 'latest') return t('最新を採用')
  if (policy === 'average') return t('統合')
  return t('重複時はエラー')
}

const reportSnapshotRows = computed<ReportSnapshotRow[]>(() => {
  const sorted = baselineCompiledOptions.value
    .map((option, index) => ({
      option,
      index,
      timestamp: option.createdAt ? new Date(option.createdAt).getTime() : Number.NaN,
    }))
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.timestamp)
      const rightValid = Number.isFinite(right.timestamp)
      if (leftValid && rightValid && left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp
      }
      if (leftValid !== rightValid) return leftValid ? -1 : 1
      return left.index - right.index
    })

  return sorted.map(({ option }) => ({
    compiledId: option.compiledId,
    createdAtLabel: formatCompiledSnapshotTimestamp(option.createdAt, snapshotLocaleTag.value),
    snapshotLabel: summarizeSnapshotLabel(option),
    winnerPolicyLabel: summarizeWinnerPolicy(option.compileOptions.winner_policy),
    missingDataLabel: summarizeMissingDataPolicy(option.compileOptions.missing_data_policy),
    mergePolicyLabel: summarizeMergePolicy(option.compileOptions.duplicate_normalization.merge_policy),
    isSelected: option.compiledId === selectedCompiledId.value,
  }))
})

function showExistingReport(compiledId: string) {
  const targetId = String(compiledId).trim()
  if (!targetId || targetId === selectedCompiledId.value) return
  selectedCompiledId.value = targetId
  emitReportMetric('cta_click', { cta: 'select_existing_report' })
}

function openDeleteCompiledModal(row: ReportSnapshotRow) {
  deleteTargetCompiledId.value = String(row.compiledId).trim()
  deleteTargetSnapshotLabel.value = String(row.snapshotLabel).trim()
  emitReportMetric('cta_click', { cta: 'open_delete_snapshot_confirm' })
}

function closeDeleteCompiledModal() {
  deleteTargetCompiledId.value = ''
  deleteTargetSnapshotLabel.value = ''
}

const selectedDiffBaselineCompiledId = computed(() =>
  String(compileDiffBaselineSelection.value).trim()
)
const reportSectionOptions = computed<
  Array<{
    key: 'operations' | 'fairness' | 'announcement'
    label: string
    description: string
  }>
>(() => [
  {
    key: 'operations',
    label: t('カテゴリ別順位一覧'),
    description: t('集計区分ごとの順位と差分を確認'),
  },
  {
    key: 'fairness',
    label: t('統計'),
    description: t('偏り・割当と分析指標をまとめて確認'),
  },
  {
    key: 'announcement',
    label: t('発表出力'),
    description: t('スライドと表彰出力を確認'),
  },
])
const showOperationsSection = computed(
  () => !reportUxV3Enabled || activeReportSection.value === 'operations'
)
const showFairnessSection = computed(
  () => !reportUxV3Enabled || activeReportSection.value === 'fairness'
)
const showAnnouncementSection = computed(
  () => !reportUxV3Enabled || activeReportSection.value === 'announcement'
)
const canShowAnalysisCharts = computed(
  () =>
    showFairnessSection.value &&
    (!reportUxV3Enabled || analysisChartsReady.value) &&
    isStandardLabel.value &&
    activeResults.value.length > 0
)
const analysisEmptyState = computed(() => {
  if (!isStandardLabel.value) {
    return {
      title: t('このカテゴリでは分析統計を表示できません'),
      message: t('分析はチーム・スピーカー・ジャッジの集計区分で利用できます。'),
    }
  }
  if (activeResults.value.length === 0) {
    return {
      title: t('分析データがありません'),
      message: t('集計を実行すると分析を表示できます。'),
    }
  }
  return {
    title: t('分析を準備しています'),
    message: t('初回表示時のみグラフを読み込んでいます。'),
  }
})
const canRunCompile = computed(() => {
  if (!selectedDiffBaselineCompiledId.value) return true
  return diffBaselineCompiledOptions.value.some(
    (option) => option.compiledId === selectedDiffBaselineCompiledId.value
  )
})
const canSavePreview = computed(() => compileManualSaveEnabled && compileWorkflow.canSave)
const displayedCompileSource = computed<'submissions' | 'raw'>(() =>
  compiled.value?.compile_source === 'raw' ? 'raw' : 'submissions'
)
const isDisplayedRawSource = computed(() => displayedCompileSource.value === 'raw')
const isRawModeActive = computed(
  () => isDisplayedRawSource.value
)
const compileTargetRoundNumbers = computed(() => normalizeRoundSelection(compileRounds.value))
const compileIncludeLabelsFromRounds = computed(() =>
  includeLabelsFromRoundDetailsAny(
    rounds.rounds.map((round) => ({
      round: round.round,
      userDefinedData: round.userDefinedData ?? undefined,
    })),
    compileTargetRoundNumbers.value
  )
)
function buildCompileOptions(overrides?: {
  missing_data_policy?: CompileOptions['missing_data_policy']
}): CompileOptions {
  const rankingOrder = Array.from(new Set(rankingPriorityOrder.value))
  return {
    ranking_priority: {
      preset: rankingPriorityPreset.value,
      order:
        rankingOrder.length > 0
          ? rankingOrder
          : [...DEFAULT_COMPILE_OPTIONS.ranking_priority.order],
    },
    winner_policy: compileWinnerPolicy.value,
    tie_points:
      Number.isFinite(compileTiePoints.value) && compileTiePoints.value >= 0
        ? compileTiePoints.value
        : DEFAULT_COMPILE_OPTIONS.tie_points,
    duplicate_normalization: {
      merge_policy: compileDuplicateMergePolicy.value,
      poi_aggregation: compilePoiAggregation.value,
      best_aggregation: compileBestAggregation.value,
    },
    missing_data_policy: overrides?.missing_data_policy ?? compileMissingDataPolicy.value,
    include_labels: compileIncludeLabelsFromRounds.value,
    diff_baseline: selectedDiffBaselineCompiledId.value
      ? { mode: 'compiled', compiled_id: selectedDiffBaselineCompiledId.value }
      : { mode: 'latest' },
  }
}

function trackCompileMetric(
  metric: 'preview_run' | 'save_snapshot' | 'save_blocked_stale' | 'save_cancelled',
  source: CompileSource,
  reason?: string
) {
  if (!compileManualSaveEnabled) return
  trackAdminCompileWorkflowMetric({
    metric,
    tournamentId: tournamentId.value,
    screen: 'reports',
    source,
    reason,
  })
}

function buildCompileInputKey(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
): string {
  return JSON.stringify({
    source,
    rounds: [...compileTargetRoundNumbers.value],
    options: buildCompileOptions(optionOverrides),
  })
}

function toSnapshotTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function compileRoundRangeLabel(rounds: number[]): string {
  const normalized = Array.from(
    new Set(rounds.filter((round) => Number.isInteger(round) && round >= 1))
  ).sort((left, right) => left - right)
  if (normalized.length === 0) return t('未選択')
  if (normalized.length === 1) return roundName(normalized[0])
  return `${roundName(normalized[0])}-${roundName(normalized[normalized.length - 1])}`
}

function buildDefaultSnapshotName(source: CompileSource): string {
  const roundsText = compileRoundRangeLabel(compileTargetRoundNumbers.value)
  const timestamp = toSnapshotTimeString(new Date())
  const suffix = source === 'raw' ? `（${t('強制集計')}）` : ''
  return `${roundsText} / ${timestamp}${suffix}`
}

const manualCompileInputKey = computed(() =>
  buildCompileInputKey(manualCompileSource.value, manualCompileOptionOverrides.value)
)
const compileDiffMeta = computed<any | null>(() =>
  compiled.value?.compile_diff_meta && typeof compiled.value.compile_diff_meta === 'object'
    ? compiled.value.compile_diff_meta
    : null
)

function mapInstitutions(values: any): string[] {
  if (!Array.isArray(values)) return []
  if (institutions.institutions.length === 0) return values.map((v) => String(v))
  return values.map((value) => {
    const token = String(value)
    const match = institutions.institutions.find((inst) => inst._id === token)
    return match?.name ?? token
  })
}

function mapEntityNames(values: any): string[] {
  if (!Array.isArray(values)) return []
  return values.map((value) => entities.value[String(value)] ?? String(value))
}

function mapResultRows(source: any[], label: CompiledLabel = activeLabel.value) {
  return source.map((result: any) => {
    const base = {
      ...result,
      name: entityName(result.id),
      institutions: mapInstitutions(result.institutions),
      teams: mapEntityNames(result.teams ?? []),
    }
    if (label === 'adjudicators') {
      const comments =
        result.details?.flatMap((detail: any) =>
          Array.isArray(detail.comments) ? detail.comments : []
        ) ?? []
      return {
        ...base,
        comments: comments.filter((comment: any) => typeof comment === 'string' && comment.trim() !== ''),
        judged_teams: mapEntityNames(result.judged_teams ?? []),
      }
    }
    return base
  })
}

function resultSourceForLabel(compiledDoc: Record<string, any>, label: string) {
  if (label === 'speakers') return compiledDoc.compiled_speaker_results ?? []
  if (label === 'adjudicators') return compiledDoc.compiled_adjudicator_results ?? []
  if (label === 'poi') return buildSubPrizeResultsFromCompiled(compiledDoc, 'poi')
  if (label === 'best') return buildSubPrizeResultsFromCompiled(compiledDoc, 'best')
  return compiledDoc.compiled_team_results ?? []
}

const activeResultsSource = computed<any[]>(() => {
  if (!compiled.value) return []
  return resultSourceForLabel(compiled.value, activeLabel.value)
})

const selectedDiffBaselineCompiled = computed<Record<string, any> | null>(() => {
  const baselineId = selectedDiffBaselineCompiledId.value
  if (!baselineId) return null
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === baselineId)
  if (!matched) return null
  return normalizeCompiledDoc(matched)
})

const selectedDiffBaselineRows = computed<any[]>(() => {
  if (!selectedDiffBaselineCompiled.value) return []
  return resultSourceForLabel(selectedDiffBaselineCompiled.value, activeLabel.value)
})

const activeResults = computed<any[]>(() => {
  const mapped = mapResultRows(activeResultsSource.value, activeLabel.value)
  if (!selectedDiffBaselineCompiledId.value || selectedDiffBaselineRows.value.length === 0) {
    return mapped
  }
  return applyClientBaselineDiff(mapped, selectedDiffBaselineRows.value)
})
const sortedActiveResults = computed<any[]>(() => {
  const key = resultSortKey.value
  const direction = resultSortDirection.value === 'asc' ? 1 : -1
  return activeResults.value
    .map((row, index) => ({ row, index }))
    .sort((leftEntry, rightEntry) => {
      const left = resultSortValue(leftEntry.row, key)
      const right = resultSortValue(rightEntry.row, key)
      const numericLeft = typeof left === 'number' ? left : null
      const numericRight = typeof right === 'number' ? right : null
      if (numericLeft !== null && numericRight !== null) {
        const delta = numericLeft - numericRight
        if (delta !== 0) return direction * delta
        return leftEntry.index - rightEntry.index
      }
      const diff = sortCollator.compare(String(left ?? ''), String(right ?? ''))
      if (diff !== 0) return direction * diff
      return leftEntry.index - rightEntry.index
    })
    .map((entry) => entry.row)
})
const showDiffLegend = computed(() =>
  activeResults.value.some((row: any) => row?.diff?.ranking) || compileDiffMeta.value !== null
)

const announcementResultsSource = computed<any[]>(() => {
  if (!compiled.value) return []
  return resultSourceForLabel(compiled.value, slideLabel.value)
})
const announcementResults = computed<any[]>(() =>
  mapResultRows(announcementResultsSource.value, slideLabel.value)
)

const awardCopyRows = computed(() => {
  if (announcementResults.value.length === 0) return []
  const ranked = announcementResults.value
    .filter((row) => Number.isFinite(Number(row.ranking)))
    .slice()
    .sort((a, b) => Number(a.ranking) - Number(b.ranking))
  const max = Math.max(1, Number(maxRankingRewarded.value || 1))
  return ranked.filter((row) => Number(row.ranking) <= max)
})

const awardCopyText = computed(() => {
  return awardCopyRows.value
    .map((row) => {
      const name = entityName(String(row.id))
      const teamText =
        Array.isArray(row.teams) && row.teams.length > 0 ? `（${row.teams.map((item: any) => String(item)).join('/')}）` : ''
      const metric =
        slideLabel.value === 'poi'
          ? formatTimesCount(Number(row.poi ?? 0))
          : slideLabel.value === 'best'
            ? formatTimesCount(Number(row.best ?? 0))
            : locale.value === 'ja'
              ? `${row.ranking}位`
              : ordinal(Number(row.ranking))
      return `${name}${teamText} ${metric}`
    })
    .join('\n')
})

const institutionNameMap = computed(() => {
  const map = new Map<string, string>()
  institutions.institutions.forEach((institution) => {
    map.set(String(institution._id), institution.name)
  })
  return map
})

function resolveInstitutionName(token: string): string {
  return institutionNameMap.value.get(token) ?? token
}

function collectTeamInstitutionNames(team: any): string[] {
  const set = new Set<string>()
  const direct = String(team?.institution ?? '').trim()
  if (direct) set.add(resolveInstitutionName(direct))
  ;(team?.details ?? []).forEach((detail: any) => {
    ;(detail?.institutions ?? []).forEach((institutionId: any) => {
      const token = String(institutionId ?? '').trim()
      if (!token) return
      set.add(resolveInstitutionName(token))
    })
  })
  return Array.from(set)
}

function collectAdjudicatorInstitutionNames(adjudicator: any): string[] {
  const set = new Set<string>()
  ;(adjudicator?.details ?? []).forEach((detail: any) => {
    ;(detail?.institutions ?? []).forEach((institutionId: any) => {
      const token = String(institutionId ?? '').trim()
      if (!token) return
      set.add(resolveInstitutionName(token))
    })
  })
  return Array.from(set)
}

const speakerTeamNameMap = computed(() => {
  const byId = new Map<string, string>()
  teams.teams.forEach((team) => {
    const teamName = String(team.name ?? '')
    ;(team.details ?? []).forEach((detail: any) => {
      ;(detail?.speakers ?? []).forEach((speakerId: any) => {
        const token = String(speakerId ?? '').trim()
        if (!token || byId.has(token)) return
        byId.set(token, teamName)
      })
    })
  })
  return byId
})

function awardMetricLabel(label: CompiledLabel) {
  if (label === 'teams') return teamHasScores.value ? t('合計') : t('勝利数')
  if (label === 'speakers') return t('平均')
  if (label === 'adjudicators') return t('平均')
  if (label === 'poi') return t('POI合計')
  if (label === 'best') return t('ベストスピーカー合計')
  return ''
}

function awardMetricValue(row: any, label: CompiledLabel): string | number {
  if (label === 'teams') return teamHasScores.value ? Number(row?.sum ?? 0) : Number(row?.win ?? 0)
  if (label === 'speakers') return Number(row?.average ?? 0)
  if (label === 'adjudicators') return Number(row?.average ?? 0)
  if (label === 'poi') return Number(row?.poi ?? 0)
  if (label === 'best') return Number(row?.best ?? 0)
  return ''
}

const awardExportRows = computed<AwardExportRowInput[]>(() =>
  awardCopyRows.value.map((row) => ({
    category: labelDisplay(slideLabel.value),
    ranking: Number(row?.ranking ?? 0),
    place: ordinal(Number(row?.ranking ?? 0)),
    id: String(row?.id ?? ''),
    name: entityName(String(row?.id ?? '')),
    team: Array.isArray(row?.teams) ? row.teams.map((item: any) => String(item)).join('/') : '',
    metric_name: awardMetricLabel(slideLabel.value),
    metric_value: awardMetricValue(row, slideLabel.value),
  }))
)

const participantExportRows = computed<ParticipantExportRowInput[]>(() => {
  const rows: ParticipantExportRowInput[] = []

  teams.teams.forEach((team) => {
    rows.push({
      participant_type: 'team',
      id: String(team._id),
      name: String(team.name ?? ''),
      institutions: collectTeamInstitutionNames(team),
    })
  })

  speakers.speakers.forEach((speaker) => {
    const speakerId = String(speaker._id)
    const speakerName = String(speaker.name ?? '')
    rows.push({
      participant_type: 'speaker',
      id: speakerId,
      name: speakerName,
      team: speakerTeamNameMap.value.get(speakerId) ?? '',
    })
  })

  adjudicators.adjudicators.forEach((adjudicator) => {
    rows.push({
      participant_type: 'adjudicator',
      id: String(adjudicator._id),
      name: String(adjudicator.name ?? ''),
      institutions: collectAdjudicatorInstitutionNames(adjudicator),
      active: adjudicator.active === true,
    })
  })

  return rows
})

const tableColumns = computed(() => {
  if (activeLabel.value === 'poi' || activeLabel.value === 'best') {
    return ['ranking', 'id', 'teams', activeLabel.value]
  }
  if (activeLabel.value === 'adjudicators') {
    return [
      'ranking',
      'id',
      'institutions',
      'average',
      'sd',
      'num_experienced',
      'num_experienced_chair',
      'comments',
    ]
  }
  if (activeLabel.value === 'speakers') {
    return ['ranking', 'id', 'teams', 'average', 'sum', 'sd']
  }
  if (teamHasScores.value) {
    return ['ranking', 'id', 'institutions', 'win', 'average', 'sum', 'margin', 'vote', 'sd']
  }
  return ['ranking', 'id', 'institutions', 'win']
})

const scoreKey = computed(() => {
  if (activeLabel.value === 'adjudicators') return 'score'
  if (activeLabel.value === 'speakers') return 'average'
  const hasSum = activeResults.value.some((result) =>
    result.details?.some((detail: any) => typeof detail.sum === 'number')
  )
  return hasSum ? 'sum' : 'win'
})

const isStandardLabel = computed(() =>
  ['teams', 'speakers', 'adjudicators'].includes(activeLabel.value)
)

const poiResults = computed(() => buildSubPrizeResults('poi'))
const bestResults = computed(() => buildSubPrizeResults('best'))

function entityName(id: string) {
  return entities.value[id] ?? id
}

function teamName(id: string) {
  return teams.teams.find((team) => team._id === id)?.name ?? id
}

function adjudicatorName(id: string) {
  return adjudicators.adjudicators.find((adj) => adj._id === id)?.name ?? id
}

function speakerName(id: string) {
  return speakers.speakers.find((speaker) => speaker._id === id)?.name ?? id
}

function roundName(r: number) {
  return (
    rounds.rounds.find((round) => round.round === r)?.name ??
    sortedRounds.value.find((round: RoundSummary) => round.round === r)?.name ??
    t('ラウンド {round}', { round: r })
  )
}

function applyCompileDefaultsFromTournament() {
  if (!tournamentId.value) return
  const tournament = tournamentStore.tournaments.find((item) => item._id === tournamentId.value)
  if (!tournament) return
  const normalizedDefaults = normalizeRoundDefaults(tournament.user_defined_data?.round_defaults)
  const compileDefaults = normalizedDefaults.compile
  const normalizedOptions = normalizeCompileOptions(compileDefaults.options, compileDefaults.options)
  rankingPriorityPreset.value = normalizedOptions.ranking_priority.preset
  rankingPriorityOrder.value = [...normalizedOptions.ranking_priority.order]
  compileWinnerPolicy.value = normalizedOptions.winner_policy
  compileTiePoints.value = normalizedOptions.tie_points
  compileDuplicateMergePolicy.value = normalizedOptions.duplicate_normalization.merge_policy
  compilePoiAggregation.value = normalizedOptions.duplicate_normalization.poi_aggregation
  compileBestAggregation.value = normalizedOptions.duplicate_normalization.best_aggregation
  compileMissingDataPolicy.value = normalizedOptions.missing_data_policy
  compileRounds.value = [...availableCompileRoundNumbers.value]
  compileDiffBaselineSelection.value = ''
}

function captureRecomputeSnapshot(): RecomputeOptionsSnapshot {
  return {
    compileRounds: [...compileRounds.value],
    rankingPreset: rankingPriorityPreset.value,
    rankingOrder: [...rankingPriorityOrder.value],
    winnerPolicy: compileWinnerPolicy.value,
    tiePoints: compileTiePoints.value,
    mergePolicy: compileDuplicateMergePolicy.value,
    poiAggregation: compilePoiAggregation.value,
    bestAggregation: compileBestAggregation.value,
    missingDataPolicy: compileMissingDataPolicy.value,
  }
}

function restoreRecomputeSnapshot(snapshot: RecomputeOptionsSnapshot) {
  compileRounds.value = [...snapshot.compileRounds]
  rankingPriorityPreset.value = snapshot.rankingPreset
  rankingPriorityOrder.value = [...snapshot.rankingOrder]
  compileWinnerPolicy.value = snapshot.winnerPolicy
  compileTiePoints.value = snapshot.tiePoints
  compileDuplicateMergePolicy.value = snapshot.mergePolicy
  compilePoiAggregation.value = snapshot.poiAggregation
  compileBestAggregation.value = snapshot.bestAggregation
  compileMissingDataPolicy.value = snapshot.missingDataPolicy
}

function openRecomputeOptions() {
  recomputeSnapshot.value = captureRecomputeSnapshot()
  showRecomputeOptions.value = true
}

function cancelRecomputeOptions() {
  if (recomputeSnapshot.value) {
    restoreRecomputeSnapshot(recomputeSnapshot.value)
  }
  recomputeSnapshot.value = null
  showRecomputeOptions.value = false
}

function applyRecomputeOptions() {
  recomputeSnapshot.value = null
  showRecomputeOptions.value = false
}

function resolveCompiledDocId(doc: any): string {
  return String(doc?._id ?? '').trim()
}

function normalizeCompiledDoc(doc: any): Record<string, any> | null {
  const payload = doc?.payload && typeof doc.payload === 'object' ? doc.payload : doc
  if (!payload || typeof payload !== 'object') return null
  const normalized = { ...(payload as Record<string, any>) }
  const compiledId = resolveCompiledDocId(doc)
  if (compiledId) normalized._id = compiledId
  if (doc?.createdAt) normalized.createdAt = doc.createdAt
  if (doc?.updatedAt) normalized.updatedAt = doc.updatedAt
  return normalized
}

function applyCompiledSnapshot(compiledId: string) {
  const targetId = String(compiledId).trim()
  if (!targetId) return
  const matched = compiledHistory.value.find((item) => resolveCompiledDocId(item) === targetId)
  if (!matched) return
  const normalized = normalizeCompiledDoc(matched)
  if (!normalized) return
  compiledStore.clearPreview()
  compileWorkflow.clearPreview()
  compiledStore.compiled = normalized
  compileExecuted.value = true
}

function applyDefaultDiffBaselineSelection(currentCompiledId?: string) {
  const resolved = resolvePreviousCompiledId(
    baselineCompiledOptions.value,
    currentCompiledId ?? selectedCompiledId.value
  )
  compileDiffBaselineSelection.value = diffBaselineCompiledOptions.value.some(
    (option) => option.compiledId === resolved
  )
    ? resolved
    : ''
}

const drawByRound = computed(() => {
  const map = new Map<number, any>()
  draws.draws.forEach((draw) => {
    map.set(draw.round, draw)
  })
  return map
})

const submissionsByRound = computed(() => {
  const map = new Map<number, any[]>()
  submissions.submissions.forEach((item) => {
    const round = item.round
    const list = map.get(round) ?? []
    list.push(item)
    map.set(round, list)
  })
  return map
})

const roundConfigByRound = computed(() => {
  const map = new Map<number, any>()
  rounds.rounds.forEach((round) => {
    map.set(round.round, round)
  })
  return map
})
function isSpeakerScoreEnabledRound(roundNumber: number): boolean {
  const config = roundConfigByRound.value.get(roundNumber)
  return config?.userDefinedData?.no_speaker_score !== true
}
const summaryTargetRounds = computed(() => [...compileTargetRoundNumbers.value])
const fairnessVisualRoundNumbers = computed(() => {
  const compiledRounds = Array.isArray(compiled.value?.rounds) ? compiled.value.rounds : []
  const selectedRounds = normalizeRoundSelection(
    compiledRounds.map((entry: any) => entry?.r ?? entry?.round ?? entry)
  )
  if (selectedRounds.length > 0) return selectedRounds

  const roundsFromTeamDetails = normalizeRoundSelection(
    teamResults.value.flatMap((result) =>
      Array.isArray(result?.details) ? result.details.map((detail: any) => detail?.r) : []
    )
  )
  if (roundsFromTeamDetails.length > 0) return roundsFromTeamDetails
  return [...summaryTargetRounds.value]
})
const fairnessVisualRounds = computed<RoundSummary[]>(() => {
  const roundSet = new Set(fairnessVisualRoundNumbers.value)
  return sortedRounds.value.filter((round) => roundSet.has(round.round))
})
const scoreEnabledFairnessRoundNumbers = computed(() =>
  fairnessVisualRoundNumbers.value.filter((round) => isSpeakerScoreEnabledRound(round))
)
const scoreEnabledFairnessRounds = computed<RoundSummary[]>(() => {
  const roundSet = new Set(scoreEnabledFairnessRoundNumbers.value)
  return fairnessVisualRounds.value.filter((round) => roundSet.has(round.round))
})

function expectedIdsForRound(r: number) {
  const draw = drawByRound.value.get(r)
  const expectedAdjudicators = new Set<string>()
  const expectedTeams = new Set<string>()
  draw?.allocation?.forEach((row: any) => {
    if (row?.teams?.gov) expectedTeams.add(String(row.teams.gov))
    if (row?.teams?.opp) expectedTeams.add(String(row.teams.opp))
    ;(row?.chairs ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.panels ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
    ;(row?.trainees ?? []).forEach((id: string) => expectedAdjudicators.add(String(id)))
  })
  return { expectedAdjudicators, expectedTeams }
}

function speakerIdsForTeamRound(teamId: string, r: number) {
  const team = teams.teams.find((item) => item._id === teamId)
  if (!team) return []
  const detail = team.details?.find((d: any) => d.r === r)
  const detailSpeakers = (detail?.speakers ?? []).map((id: any) => String(id)).filter(Boolean)
  return detailSpeakers
}

function expectedSpeakerIdsForRound(r: number) {
  const { expectedTeams } = expectedIdsForRound(r)
  const set = new Set<string>()
  expectedTeams.forEach((teamId) => {
    speakerIdsForTeamRound(teamId, r).forEach((id) => set.add(id))
  })
  return set
}

function ballotSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'ballot')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function feedbackSubmittedIds(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const set = new Set<string>()
  list
    .filter((item) => item.type === 'feedback')
    .forEach((item: any) => {
      const id = item.payload?.submittedEntityId
      if (id) set.add(String(id))
    })
  return set
}

function unknownCountsByRound(r: number) {
  const list = submissionsByRound.value.get(r) ?? []
  const ballot = list.filter(
    (item: any) => item.type === 'ballot' && !(item.payload as any)?.submittedEntityId
  ).length
  const feedback = list.filter(
    (item: any) => item.type === 'feedback' && !(item.payload as any)?.submittedEntityId
  ).length
  return { ballot, feedback }
}

function duplicateSubmitterCountByRound(r: number, type: 'ballot' | 'feedback') {
  const list = submissionsByRound.value.get(r) ?? []
  const counter = new Map<string, number>()
  list
    .filter((item: any) => item.type === type)
    .forEach((item: any) => {
      const submittedEntityId = String(item?.payload?.submittedEntityId ?? '').trim()
      if (!submittedEntityId) return
      counter.set(submittedEntityId, (counter.get(submittedEntityId) ?? 0) + 1)
    })
  return Array.from(counter.values()).reduce((acc, count) => acc + Math.max(0, count - 1), 0)
}

function expectedFeedbackIdsForRound(r: number) {
  const config = roundConfigByRound.value.get(r)
  const set = new Set<string>()
  if (config?.userDefinedData?.evaluate_from_teams !== false) {
    if (config?.userDefinedData?.evaluator_in_team === 'speaker') {
      expectedSpeakerIdsForRound(r).forEach((id) => set.add(id))
    } else {
      expectedIdsForRound(r).expectedTeams.forEach((id) => set.add(id))
    }
  }
  if (config?.userDefinedData?.evaluate_from_adjudicators !== false) {
    expectedIdsForRound(r).expectedAdjudicators.forEach((id) => set.add(id))
  }
  return set
}

type RoundSubmissionSummary = {
  round: number
  ballot: {
    expected: number
    submitted: number
    missing: number
    duplicates: number
    unknown: number
  }
  feedback: {
    expected: number
    submitted: number
    missing: number
    duplicates: number
    unknown: number
  }
}

const roundSubmissionSummaries = computed<RoundSubmissionSummary[]>(() =>
  summaryTargetRounds.value.map((round) => {
    const { expectedAdjudicators } = expectedIdsForRound(round)
    const submittedBallot = ballotSubmittedIds(round)
    const unknown = unknownCountsByRound(round)
    const expectedFeedback = expectedFeedbackIdsForRound(round)
    const submittedFeedback = feedbackSubmittedIds(round)
    return {
      round,
      ballot: {
        expected: expectedAdjudicators.size,
        submitted: submittedBallot.size,
        missing: Math.max(0, expectedAdjudicators.size - submittedBallot.size),
        duplicates: duplicateSubmitterCountByRound(round, 'ballot'),
        unknown: unknown.ballot,
      },
      feedback: {
        expected: expectedFeedback.size,
        submitted: submittedFeedback.size,
        missing: Math.max(0, expectedFeedback.size - submittedFeedback.size),
        duplicates: duplicateSubmitterCountByRound(round, 'feedback'),
        unknown: unknown.feedback,
      },
    }
  })
)
const submissionIssueRound = computed<number | null>(() => {
  const missing = roundSubmissionSummaries.value.find(
    (summary) => summary.ballot.missing + summary.feedback.missing > 0
  )
  if (missing) return missing.round
  const needsReview = roundSubmissionSummaries.value.find(
    (summary) =>
      summary.ballot.duplicates +
        summary.feedback.duplicates +
        summary.ballot.unknown +
        summary.feedback.unknown >
      0
  )
  if (needsReview) return needsReview.round
  const fallback = summaryTargetRounds.value[summaryTargetRounds.value.length - 1]
  return Number.isInteger(fallback) ? fallback : null
})
const submissionsOperationsLink = computed(() => {
  const basePath = `/admin/${tournamentId.value}/operations`
  if (submissionIssueRound.value === null) return `${basePath}?task=submissions`
  return `${basePath}?task=submissions&round=${submissionIssueRound.value}`
})
const submissionOperationsLinkLabel = computed(() =>
  submissionIssueRound.value === null
    ? t('提出状況タブへ')
    : t('提出状況タブへ（{round}）', { round: roundName(submissionIssueRound.value) })
)

function submissionOperationsLinkForRound(roundNumber: number): string {
  return `/admin/${tournamentId.value}/operations?task=submissions&round=${roundNumber}`
}
const fairnessTargetRounds = computed(() => new Set(fairnessVisualRoundNumbers.value))
const fairnessSideSummary = computed(() => {
  let govAppearances = 0
  let oppAppearances = 0
  let govWins = 0
  let oppWins = 0
  teamResults.value.forEach((team) => {
    ;(team?.details ?? []).forEach((detail: any) => {
      const round = detail?.r
      if (!fairnessTargetRounds.value.has(round)) return
      if (detail?.side === 'gov') {
        govAppearances += 1
        if (detail?.win === 1) govWins += 1
      } else if (detail?.side === 'opp') {
        oppAppearances += 1
        if (detail?.win === 1) oppWins += 1
      }
    })
  })
  const totalAppearances = govAppearances + oppAppearances
  const exposureGap =
    totalAppearances > 0 ? (govAppearances - oppAppearances) / totalAppearances : 0
  const govWinRate = govAppearances > 0 ? govWins / govAppearances : 0
  const oppWinRate = oppAppearances > 0 ? oppWins / oppAppearances : 0
  const winRateGap = govWinRate - oppWinRate
  let severity: FairnessSeverity = 'low'
  if (Math.abs(winRateGap) >= 0.12 || Math.abs(exposureGap) >= 0.12) severity = 'high'
  else if (Math.abs(winRateGap) >= 0.06 || Math.abs(exposureGap) >= 0.06) severity = 'medium'
  return {
    severity,
    govAppearances,
    oppAppearances,
    govWinRate,
    oppWinRate,
    winRateGap,
    exposureGap,
  }
})
const hasFairnessSideData = computed(
  () => fairnessSideSummary.value.govAppearances + fairnessSideSummary.value.oppAppearances > 0
)
const fairnessMatchupSummary = computed(() => {
  const pairCounts = new Map<string, number>()
  sortedRounds.value.forEach((round) => {
    const roundNumber = round.round
    if (!fairnessTargetRounds.value.has(roundNumber)) return
    const draw = drawByRound.value.get(roundNumber)
    ;(draw?.allocation ?? []).forEach((allocation: any) => {
      const gov = String(allocation?.teams?.gov ?? '').trim()
      const opp = String(allocation?.teams?.opp ?? '').trim()
      if (!gov || !opp) return
      const pair = [gov, opp].sort().join('::')
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1)
    })
  })
  const repeats = Array.from(pairCounts.values())
  const repeatedPairs = repeats.filter((count) => count > 1).length
  const extraRepeats = repeats.reduce((acc, count) => acc + Math.max(0, count - 1), 0)
  const maxRepeat = repeats.length > 0 ? Math.max(...repeats) : 0
  let severity: FairnessSeverity = 'low'
  if (maxRepeat >= 3 || extraRepeats >= 4) severity = 'high'
  else if (repeatedPairs > 0) severity = 'medium'
  return {
    severity,
    repeatedPairs,
    extraRepeats,
    maxRepeat,
  }
})
const hasFairnessMatchupData = computed(() => fairnessMatchupSummary.value.maxRepeat > 0)
const fairnessJudgeSummary = computed(() => {
  const counts = new Map<string, number>()
  adjudicators.adjudicators.forEach((adj) => {
    counts.set(String(adj._id), 0)
  })
  sortedRounds.value.forEach((round) => {
    const roundNumber = round.round
    if (!fairnessTargetRounds.value.has(roundNumber)) return
    const draw = drawByRound.value.get(roundNumber)
    ;(draw?.allocation ?? []).forEach((allocation: any) => {
      ;(allocation?.chairs ?? []).forEach((adjId: any) => {
        const key = String(adjId)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      })
      ;(allocation?.panels ?? []).forEach((adjId: any) => {
        const key = String(adjId)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      })
      ;(allocation?.trainees ?? []).forEach((adjId: any) => {
        const key = String(adjId)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      })
    })
  })
  const values = Array.from(counts.values())
  if (values.length === 0) {
    return {
      severity: 'low' as FairnessSeverity,
      spread: 0,
      average: 0,
      max: 0,
      min: 0,
    }
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const average = values.reduce((acc, value) => acc + value, 0) / values.length
  const spread = max - min
  let severity: FairnessSeverity = 'low'
  if (spread >= 4) severity = 'high'
  else if (spread >= 2) severity = 'medium'
  return {
    severity,
    spread,
    average: Math.round(average * 100) / 100,
    max,
    min,
  }
})
const hasFairnessJudgeData = computed(() => fairnessJudgeSummary.value.max > 0)
const judgeFeedbackRankingRows = computed<JudgeFeedbackRankingRow[]>(() => {
  const adjudicatorRows = compiled.value?.compiled_adjudicator_results ?? []
  const matchCountByJudge = new Map<string, number>()
  adjudicatorRows.forEach((row: any) => {
    const id = String(row?.id ?? '').trim()
    if (!id) return
    const count = toFiniteNumber(row?.num_experienced)
    matchCountByJudge.set(id, count === null ? 0 : Math.max(0, Math.round(count)))
  })
  return buildJudgeStrictnessRows(adjudicatorRows).map((row) => ({
    ...row,
    matchCount: matchCountByJudge.get(row.id) ?? 0,
  }))
})
const judgeFeedbackRankingOutliers = computed(
  () => judgeFeedbackRankingRows.value.filter((row) => row.outlier).length
)
const canShowJudgeFeedbackRanking = computed(() => judgeFeedbackRankingRows.value.length > 0)
const judgeFeedbackRankingPreview = computed(() => judgeFeedbackRankingRows.value.slice(0, 8))

function toFiniteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toFiniteNumber(item))
    .filter((item): item is number => item !== null)
}

function averageOfNumbers(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

function roundToThree(value: number): number {
  return Math.round(value * 1000) / 1000
}

const judgeBallotStrictnessSummary = computed(() => {
  const matchesByRound = new Map<number, Array<{ judgeId: string; meanScore: number }>>()

  submissions.submissions.forEach((submission: any) => {
    if (submission.type !== 'ballot') return
    const round = Number(submission.round)
    if (!Number.isInteger(round) || !fairnessTargetRounds.value.has(round)) return

    const payload = (submission.payload ?? {}) as Record<string, unknown>
    const judgeId = String(payload.submittedEntityId ?? '').trim()
    if (!judgeId) return

    const scores = [
      ...toFiniteNumberList(payload.scoresA),
      ...toFiniteNumberList(payload.scoresB),
    ]
    const meanScore = averageOfNumbers(scores)
    if (meanScore === null) return

    const list = matchesByRound.get(round) ?? []
    list.push({ judgeId, meanScore })
    matchesByRound.set(round, list)
  })

  const byJudge = new Map<string, { matchCount: number; scores: number[]; deltas: number[] }>()
  let totalMatches = 0

  matchesByRound.forEach((rows) => {
    if (rows.length < 2) return
    const roundMean = averageOfNumbers(rows.map((row) => row.meanScore))
    if (roundMean === null) return

    rows.forEach((row) => {
      totalMatches += 1
      const current = byJudge.get(row.judgeId) ?? { matchCount: 0, scores: [], deltas: [] }
      current.matchCount += 1
      current.scores.push(row.meanScore)
      current.deltas.push(row.meanScore - roundMean)
      byJudge.set(row.judgeId, current)
    })
  })

  const normalized = Array.from(byJudge.entries())
    .map(([id, value]) => {
      const average = averageOfNumbers(value.scores)
      const roundDelta = averageOfNumbers(value.deltas)
      if (average === null || roundDelta === null) return null
      return {
        id,
        matchCount: value.matchCount,
        average,
        roundDelta,
      }
    })
    .filter(
      (
        row
      ): row is {
        id: string
        matchCount: number
        average: number
        roundDelta: number
      } => row !== null
    )

  if (normalized.length === 0) {
    return {
      rows: [] as JudgeBallotStrictnessRow[],
      totalMatches,
    }
  }

  const meanDelta = averageOfNumbers(normalized.map((row) => row.roundDelta)) ?? 0
  const variance =
    normalized.reduce((acc, row) => acc + (row.roundDelta - meanDelta) ** 2, 0) / normalized.length
  const deviation = Math.sqrt(variance)

  const rows: JudgeBallotStrictnessRow[] = normalized
    .map((row) => {
      const rawZScore = deviation === 0 ? 0 : (row.roundDelta - meanDelta) / deviation
      const zScore = roundToThree(rawZScore)
      const outlier = Math.abs(zScore) >= 1
      const direction: 'strict' | 'lenient' | 'neutral' =
        zScore <= -1 ? 'strict' : zScore >= 1 ? 'lenient' : 'neutral'
      return {
        id: row.id,
        average: roundToThree(row.average),
        roundDelta: roundToThree(row.roundDelta),
        zScore,
        matchCount: row.matchCount,
        direction,
        outlier,
      }
    })
    .sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))

  return {
    rows,
    totalMatches,
  }
})

const judgeBallotStrictnessRows = computed(() => judgeBallotStrictnessSummary.value.rows)
const judgeBallotStrictnessPreview = computed(() => judgeBallotStrictnessRows.value.slice(0, 8))
const judgeBallotStrictnessOutliers = computed(
  () => judgeBallotStrictnessRows.value.filter((row) => row.outlier).length
)
const judgeBallotStrictnessTotalMatches = computed(() => judgeBallotStrictnessSummary.value.totalMatches)
const canShowJudgeBallotStrictness = computed(
  () =>
    judgeBallotStrictnessTotalMatches.value >= 2 && judgeBallotStrictnessRows.value.length > 0
)
const fairnessAlertCount = computed(() => {
  const severities = [
    fairnessSideSummary.value.severity,
    fairnessMatchupSummary.value.severity,
    fairnessJudgeSummary.value.severity,
  ]
  const base = severities.filter((severity) => severity === 'high' || severity === 'medium').length
  return (
    base +
    (judgeFeedbackRankingOutliers.value > 0 ? 1 : 0) +
    (judgeBallotStrictnessOutliers.value > 0 ? 1 : 0)
  )
})

const commentSheetRows = computed(() =>
  buildCommentSheetRows(submissions.submissions, {
    resolveRoundName: (round) => roundName(round),
    resolveTeamName: (id) => teamName(id),
    resolveAdjudicatorName: (id) => adjudicatorName(id),
    resolveEntityName: (id) => entityName(id),
  })
)

function summarizeSubmissionCell(
  summary: RoundSubmissionSummary,
  kind: 'ballot' | 'feedback'
) {
  const value = summary[kind]
  return t('提出 {submitted}/{expected} | 未提出 {missing} | 重複 {duplicates} | 不明 {unknown}', {
    submitted: value.submitted,
    expected: value.expected,
    missing: value.missing,
    duplicates: value.duplicates,
    unknown: value.unknown,
  })
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    const rounded = Math.round(value * 1000) / 1000
    return String(rounded)
  }
  if (Array.isArray(value)) {
    if (value.length <= 3) return value.join(', ')
    return t('{count} 件', { count: value.length })
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatList(value: unknown) {
  if (!Array.isArray(value)) return formatValue(value)
  const items = value.map((item) => String(item)).filter((item) => item !== '')
  if (items.length === 0) return '—'
  if (items.length <= 5) return items.join(', ')
  return `${items.slice(0, 5).join(', ')} (+${items.length - 5})`
}

function rankingRowKey(row: any, index: number): string {
  const id = String(row?.id ?? '').trim()
  return id || `ranking-row-${index}`
}

function rankingEntityLabel(row: any): string {
  return entityName(String(row?.id ?? ''))
}

function rankingPlainValue(value: unknown): string {
  return formatList(value)
}

function optionHelp(key: string) {
  const map: Record<string, string> = {
    source: t('提出データは提出フォームの内容を集計します。生結果データは「生結果編集」で手修正した値をそのまま使います。'),
    rounds: t('ここで選んだラウンドだけを集計します。'),
    ranking: t('順位が同点のときにどの指標を先に比較するかを決めます。'),
    winner: t('提出フォームの「勝者」入力とスコア判定が食い違う場合、どちらを優先するかを設定します。'),
    tie: t('引き分けを許可する設定のときに、各チームへ与える勝敗点です。'),
    merge: t('同じ提出者から複数提出がある場合の扱いです。'),
    poi: t('同一スピーカーへのPOI複数入力を平均か最大でまとめます。'),
    best: t('同一スピーカーへのBest Debater複数入力を平均か最大でまとめます。'),
    missing: t('必要データが欠けていた場合に、警告で続行するか、除外するか、エラー停止するかを選びます。'),
    include: t('生成するランキングの種類を選びます。'),
    diff: t('差分比較の基準です。前回集計、または具体的な過去集計を選んで比較できます。'),
  }
  return map[key] ?? ''
}

function rankingTrendForRow(row: any) {
  return resolveRankingTrend(row?.diff?.ranking?.trend)
}

function rankingTrendClass(row: any) {
  const trend = rankingTrendForRow(row)
  if (trend === 'improved') return 'diff-improved'
  if (trend === 'worsened') return 'diff-worsened'
  if (trend === 'unchanged') return 'diff-unchanged'
  if (trend === 'new') return 'diff-new'
  return 'diff-na'
}

function rankingTrendText(row: any) {
  const trend = rankingTrendForRow(row)
  const deltaText = formatSignedDelta(row?.diff?.ranking?.delta)
  if (trend === 'improved') return t('順位改善 {delta}', { delta: deltaText || '' }).trim()
  if (trend === 'worsened') return t('順位悪化 {delta}', { delta: deltaText || '' }).trim()
  if (trend === 'unchanged') return t('順位変化なし')
  if (trend === 'new') return t('新規エントリー')
  return t('差分なし')
}

function rankingDeltaText(row: any) {
  return formatSignedDelta(row?.diff?.ranking?.delta)
}

function rankingSymbolForRow(row: any) {
  return rankingTrendSymbol(rankingTrendForRow(row))
}

function metricDeltaText(row: any, key: string) {
  return formatSignedDelta(row?.diff?.metrics?.[key]?.delta)
}

function resultSortValue(row: any, key: string): number | string {
  if (key === 'id') return entityName(String(row?.id ?? ''))
  if (key === 'comments' || key === 'judged_teams') return formatList(row?.[key])
  if (key === 'institutions' || key === 'teams') {
    if (Array.isArray(row?.[key])) return row[key].map((item: any) => String(item)).join(', ')
    return String(row?.[key] ?? '')
  }
  const numeric = toFiniteNumber(row?.[key])
  if (numeric !== null) return numeric
  return String(row?.[key] ?? '')
}

function setResultSort(key: string) {
  if (resultSortKey.value === key) {
    resultSortDirection.value = resultSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  resultSortKey.value = key
  resultSortDirection.value = key === 'ranking' ? 'asc' : 'desc'
}

function resultSortIndicator(key: string) {
  if (resultSortKey.value !== key) return '↕'
  return resultSortDirection.value === 'asc' ? '↑' : '↓'
}

function formatCsvValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function columnLabel(key: string) {
  const map: Record<string, string> = {
    ranking: t('順位'),
    id: t('名前'),
    institutions: t('コンフリクトグループ'),
    win: t('勝利数'),
    average: t('平均'),
    sum: t('合計'),
    margin: t('マージン'),
    vote: t('票'),
    sd: t('標準偏差'),
    num_experienced: t('担当数'),
    num_experienced_chair: t('チェア担当'),
    comments: t('コメント'),
    teams: t('チーム'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[key] ?? key
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function ordinal(value: number) {
  if (!Number.isFinite(value)) return ''
  const v = Math.round(value)
  if (locale.value === 'ja') return `${v}位`
  const mod10 = v % 10
  const mod100 = v % 100
  if (mod10 === 1 && mod100 !== 11) return `${v}st`
  if (mod10 === 2 && mod100 !== 12) return `${v}nd`
  if (mod10 === 3 && mod100 !== 13) return `${v}rd`
  return `${v}th`
}

function formatTimesCount(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  if (locale.value === 'ja') return `${rounded}回`
  return `${rounded} times`
}

function labelDisplay(label: string) {
  const map: Record<string, string> = {
    teams: t('チーム'),
    speakers: t('スピーカー'),
    adjudicators: t('ジャッジ'),
    poi: t('POI'),
    best: t('ベストスピーカー'),
  }
  return map[label] ?? label
}

function setActiveLabel(label: string) {
  if (!['teams', 'speakers', 'adjudicators', 'poi', 'best'].includes(label)) return
  activeLabel.value = label as 'teams' | 'speakers' | 'adjudicators' | 'poi' | 'best'
}

function setSlideLabel(label: string) {
  if (!['teams', 'speakers', 'adjudicators', 'poi', 'best'].includes(label)) return
  persistSlideLabel(label as CompiledLabel)
}

function emitReportMetric(metric: AdminReportMetric, payload: Record<string, unknown> = {}) {
  if (!reportUxV3Enabled) return
  trackAdminReportMetric({
    metric,
    tournamentId: tournamentId.value,
    section: activeReportSection.value,
    ...payload,
  })
}

function trackReportSectionEnter(section: ReportSectionKey, reason: 'initial' | 'switch') {
  if (!reportUxV3Enabled) return
  activeReportSectionEnteredAt.value = Date.now()
  trackAdminReportMetric({
    metric: 'tab_enter',
    tournamentId: tournamentId.value,
    section,
    reason,
  })
}

function trackReportSectionLeave(section: ReportSectionKey, reason: 'switch' | 'unmount') {
  if (!reportUxV3Enabled) return
  const dwellMs = Math.max(0, Date.now() - activeReportSectionEnteredAt.value)
  trackAdminReportMetric({
    metric: 'tab_leave',
    tournamentId: tournamentId.value,
    section,
    reason,
    dwellMs,
  })
}

function setActiveReportSection(section: ReportSectionKey) {
  if (!reportUxV3Enabled) return
  if (section === activeReportSection.value) return
  trackReportSectionLeave(activeReportSection.value, 'switch')
  activeReportSection.value = section
  trackReportSectionEnter(section, 'switch')
  if (section === 'fairness' && !analysisChartsReady.value) {
    window.setTimeout(() => {
      analysisChartsReady.value = true
    }, 120)
  }
}

function fairnessSeverityLabel(severity: FairnessSeverity) {
  if (severity === 'high') return t('偏り高')
  if (severity === 'medium') return t('要注意')
  return t('概ね均衡')
}

function fairnessSeverityClass(severity: FairnessSeverity) {
  if (severity === 'high') return 'fairness-severity-high'
  if (severity === 'medium') return 'fairness-severity-medium'
  return 'fairness-severity-low'
}

function strictnessDirectionLabel(direction: 'strict' | 'lenient' | 'neutral') {
  if (direction === 'strict') return t('厳しめ')
  if (direction === 'lenient') return t('甘め')
  return t('標準')
}

function strictnessBarClass(zScore: number) {
  if (zScore >= 0.25) return 'strictness-bar-lenient'
  if (zScore <= -0.25) return 'strictness-bar-strict'
  return 'strictness-bar-neutral'
}

function strictnessBarStyle(zScore: number) {
  const clamped = Math.max(-2, Math.min(2, Number(zScore) || 0))
  const width = (Math.abs(clamped) / 2) * 50
  if (clamped >= 0) {
    return {
      left: '50%',
      width: `${width}%`,
    }
  }
  return {
    left: `${50 - width}%`,
    width: `${width}%`,
  }
}

function downloadCommentSheetCsv() {
  if (commentSheetRows.value.length === 0) return
  emitReportMetric('cta_click', { cta: 'download_comment_sheet_csv' })
  const labels: CommentSheetCsvLabels = {
    round: t('ラウンド'),
    round_name: t('ラウンド名'),
    submission_type: t('提出種別'),
    submitted_entity_id: t('提出者ID'),
    submitted_entity_name: t('提出者'),
    matchup: t('対戦'),
    winner: t('勝者'),
    adjudicator: t('対象ジャッジ'),
    score: t('スコア'),
    role: t('ロール'),
    comment: t('コメント'),
    created_at: t('作成日時'),
    updated_at: t('更新日時'),
  }
  const csv = buildCommentSheetCsv(commentSheetRows.value, labels)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'comment_sheet.csv'
  link.click()
  URL.revokeObjectURL(url)
  emitReportMetric('export_complete', {
    exportType: 'comment_sheet_csv',
    rowCount: commentSheetRows.value.length,
  })
}

function downloadAwardCsv() {
  if (awardExportRows.value.length === 0) return
  emitReportMetric('cta_click', { cta: 'download_award_csv' })
  const csv = buildAwardExportCsv(awardExportRows.value)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'awardees.csv'
  link.click()
  URL.revokeObjectURL(url)
  emitReportMetric('export_complete', { exportType: 'award_csv', rowCount: awardExportRows.value.length })
}

function downloadParticipantCsv() {
  if (participantExportRows.value.length === 0) return
  emitReportMetric('cta_click', { cta: 'download_participant_csv' })
  const csv = buildParticipantExportCsv(participantExportRows.value)
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'participants.csv'
  link.click()
  URL.revokeObjectURL(url)
  emitReportMetric('export_complete', {
    exportType: 'participant_csv',
    rowCount: participantExportRows.value.length,
  })
}

function downloadCsv() {
  if (activeResults.value.length === 0) return
  emitReportMetric('cta_click', { cta: 'download_compiled_csv', label: activeLabel.value })
  const label = activeLabel.value
  let headerLabels: string[] = []
  let headerKeys: string[] = []

  if (label === 'teams') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('勝利数'),
      t('合計'),
      t('マージン'),
      t('票'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'win', 'sum', 'margin', 'vote', 'sd']
  } else if (label === 'speakers') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      t('平均'),
      t('合計'),
      t('標準偏差'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', 'average', 'sum', 'sd']
  } else if (label === 'adjudicators') {
    headerLabels = [t('順位'), t('順位(序数)'), t('名前'), t('平均'), t('標準偏差')]
    headerKeys = ['ranking', 'place', 'name', 'average', 'sd']
  } else if (label === 'poi' || label === 'best') {
    headerLabels = [
      t('順位'),
      t('順位(序数)'),
      t('名前'),
      t('チーム'),
      label === 'poi' ? t('POI合計') : t('ベストスピーカー合計'),
    ]
    headerKeys = ['ranking', 'place', 'name', 'team_name', label]
  } else {
    headerLabels = tableColumns.value
    headerKeys = tableColumns.value
  }

  const rows = activeResults.value
    .slice()
    .sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0))
    .map((row) => {
      const enriched: Record<string, any> = { ...row }
      enriched.name = entityName(row.id)
      enriched.place = ordinal(Number(row.ranking))
      if (label === 'speakers' || label === 'poi' || label === 'best') {
        const teamsValue = Array.isArray(row.teams) ? row.teams.join(',') : row.teams
        enriched.team_name = teamsValue ?? ''
      }
      return headerKeys.map((key) => {
        const value = key === 'name' ? enriched.name : enriched[key]
        const formatted = formatCsvValue(value)
        return escapeCsv(String(formatted))
      })
    })

  const csv = [headerLabels.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  if (label === 'teams') link.download = 'team_results.csv'
  else if (label === 'speakers') link.download = 'speaker_results.csv'
  else if (label === 'adjudicators') link.download = 'adjudicator_results.csv'
  else if (label === 'poi') link.download = 'poi_results.csv'
  else if (label === 'best') link.download = 'best_speaker_results.csv'
  else link.download = `compiled-${activeLabel.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
  emitReportMetric('export_complete', {
    exportType: 'compiled_csv',
    label,
    rowCount: rows.length,
  })
}

async function refresh() {
  if (!tournamentId.value) {
    hasLoaded.value = true
    return
  }
  try {
    await Promise.all([
      compiledStore.fetchLatest(tournamentId.value),
      tournamentStore.fetchTournaments(),
      teams.fetchTeams(tournamentId.value),
      adjudicators.fetchAdjudicators(tournamentId.value),
      rounds.fetchRounds(tournamentId.value),
      speakers.fetchSpeakers(tournamentId.value),
      institutions.fetchInstitutions(tournamentId.value),
      draws.fetchDraws(tournamentId.value),
      submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
    ])
    if (!compileDefaultsHydrated.value) {
      applyCompileDefaultsFromTournament()
      compileDefaultsHydrated.value = true
    }
    await refreshCompiledHistory()
    const currentCompiledId = String(compiledStore.compiled?._id ?? '').trim()
    if (currentCompiledId) {
      selectedCompiledId.value = currentCompiledId
    } else if (baselineCompiledOptions.value.length > 0) {
      selectedCompiledId.value = baselineCompiledOptions.value[0].compiledId
      applyCompiledSnapshot(selectedCompiledId.value)
    } else {
      selectedCompiledId.value = ''
    }
    compileExecuted.value = Boolean(compiled.value)
    applyDefaultDiffBaselineSelection(selectedCompiledId.value)
  } finally {
    hasLoaded.value = true
  }
}

function closeForceCompileModal() {
  forceCompileModalOpen.value = false
}

async function executeCompile(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
) {
  if (!tournamentId.value) return
  if (!canRunCompile.value) return
  const roundsPayload = [...compileTargetRoundNumbers.value]
  const compiledResult = await compiledStore.runCompile(tournamentId.value, {
    source,
    rounds: roundsPayload,
    options: buildCompileOptions(optionOverrides),
  })
  manualCompileSource.value = source
  manualCompileOptionOverrides.value = optionOverrides
  compileWorkflow.clearPreview()
  compiledStore.clearPreview()
  if (compiledResult) {
    compileExecuted.value = true
  }
  await Promise.all([
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
  await refreshCompiledHistory()
  const latestCompiledId = String(compiledStore.compiled?._id ?? '').trim()
  if (latestCompiledId) {
    selectedCompiledId.value = latestCompiledId
  }
  applyDefaultDiffBaselineSelection(latestCompiledId)
}

async function runPreviewWithSource(
  source: CompileSource,
  optionOverrides?: {
    missing_data_policy?: CompileOptions['missing_data_policy']
  }
) {
  if (!compileManualSaveEnabled) return
  if (!tournamentId.value || !canRunCompile.value) return
  const roundsPayload = [...compileTargetRoundNumbers.value]
  manualCompileSource.value = source
  manualCompileOptionOverrides.value = optionOverrides
  const inputKey = buildCompileInputKey(source, optionOverrides)
  compileWorkflow.setCurrentInputKey(inputKey)
  const preview = await compiledStore.runPreview(tournamentId.value, {
    source,
    rounds: roundsPayload,
    options: buildCompileOptions(optionOverrides),
  })
  const previewState = compiledStore.previewState
  if (!preview || !previewState) return
  compileWorkflow.applyPreview(
    {
      previewSignature: previewState.previewSignature,
      revision: previewState.revision,
      source,
    },
    inputKey
  )
  compileExecuted.value = true
  trackCompileMetric('preview_run', source)
}

async function runCompile() {
  if (!tournamentId.value || !canRunCompile.value) return
  emitReportMetric('cta_click', { cta: 'run_compile' })
  await executeCompile('submissions')
}

function openForceCompileModal(action: 'compile' | 'preview' | 'save' = 'compile') {
  if (!tournamentId.value || !canRunCompile.value || isLoading.value) return
  forceCompileAction.value = action
  forceCompileMissingDataPolicy.value = compileMissingDataPolicy.value
  forceCompileModalOpen.value = true
  emitReportMetric('cta_click', { cta: 'open_raw_compile_confirm' })
}

function openSaveSnapshotModal(rawConfirmed = false) {
  if (!compileManualSaveEnabled) return
  if (!compileWorkflow.canSave) {
    const source = manualCompileSource.value
    const reason = compileWorkflow.previewStale ? 'stale' : 'preview_required'
    trackCompileMetric('save_blocked_stale', source, reason)
    return
  }
  const source = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  if (source === 'raw' && !rawConfirmed) {
    openForceCompileModal('save')
    return
  }
  compileWorkflow.openSaveModal(buildDefaultSnapshotName(source))
}

function onSaveSnapshotModalCancel() {
  if (!compileManualSaveEnabled) return
  const source = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  trackCompileMetric('save_cancelled', source)
}

async function saveCompiledSnapshot() {
  if (!compileManualSaveEnabled) return
  if (!tournamentId.value || !canRunCompile.value) return
  if (!compileWorkflow.canSave) {
    openSaveSnapshotModal()
    return
  }
  const source = compileWorkflow.previewSource === 'raw' ? 'raw' : 'submissions'
  const roundsPayload = [...compileTargetRoundNumbers.value]
  const snapshotName = compileWorkflow.snapshotNameDraft.trim() || buildDefaultSnapshotName(source)
  const saved = await compiledStore.saveCompiled(tournamentId.value, {
    source,
    rounds: roundsPayload,
    options: buildCompileOptions(manualCompileOptionOverrides.value),
    snapshotName,
    snapshotMemo: compileWorkflow.snapshotMemoDraft,
    previewSignature: compileWorkflow.previewSignature,
    revision: compileWorkflow.previewRevision,
  })
  if (!saved) {
    const isPreviewStale = (compiledStore.error ?? '').toLowerCase().includes('preview is stale')
    if (isPreviewStale) {
      trackCompileMetric('save_blocked_stale', source, 'server_stale')
    }
    return
  }
  trackCompileMetric('save_snapshot', source)
  compileWorkflow.markSaved()
  compileExecuted.value = true
  await Promise.all([
    teams.fetchTeams(tournamentId.value),
    adjudicators.fetchAdjudicators(tournamentId.value),
    rounds.fetchRounds(tournamentId.value),
    speakers.fetchSpeakers(tournamentId.value),
    institutions.fetchInstitutions(tournamentId.value),
    draws.fetchDraws(tournamentId.value),
    submissions.fetchSubmissions({ tournamentId: tournamentId.value }),
  ])
  await refreshCompiledHistory()
  const latestCompiledId = String(compiledStore.compiled?._id ?? '').trim()
  if (latestCompiledId) {
    selectedCompiledId.value = latestCompiledId
  }
  applyDefaultDiffBaselineSelection(latestCompiledId)
}

async function confirmForcedCompile() {
  emitReportMetric('cta_click', { cta: 'confirm_raw_compile' })
  const action = forceCompileAction.value
  if (compileManualSaveEnabled && action === 'save') {
    closeForceCompileModal()
    openSaveSnapshotModal(true)
    return
  }
  if (compileManualSaveEnabled && action === 'preview') {
    closeForceCompileModal()
    await runPreviewWithSource('raw', {
      missing_data_policy: forceCompileMissingDataPolicy.value,
    })
    return
  }
  closeForceCompileModal()
  await executeCompile('raw', {
    missing_data_policy: forceCompileMissingDataPolicy.value,
  })
}

async function refreshCompiledHistory() {
  if (!tournamentId.value) return
  try {
    const res = await api.get('/compiled', { params: { tournamentId: tournamentId.value } })
    compiledHistory.value = Array.isArray(res.data?.data) ? res.data.data : []
  } catch {
    compiledHistory.value = []
  }
}

async function confirmDeleteCompiled() {
  const targetId = String(deleteTargetCompiledId.value).trim()
  if (!targetId || !tournamentId.value) return
  const deletedWasSelected = targetId === selectedCompiledId.value
  const deleted = await compiledStore.deleteCompiled(tournamentId.value, targetId)
  if (!deleted) return
  emitReportMetric('cta_click', { cta: 'confirm_delete_snapshot' })
  closeDeleteCompiledModal()
  await refreshCompiledHistory()
  if (baselineCompiledOptions.value.length === 0) {
    selectedCompiledId.value = ''
    compiledStore.compiled = null
    compileExecuted.value = false
    compileDiffBaselineSelection.value = ''
    return
  }

  const selectedExists = baselineCompiledOptions.value.some(
    (option) => option.compiledId === selectedCompiledId.value
  )
  if (deletedWasSelected || !selectedExists) {
    selectedCompiledId.value = baselineCompiledOptions.value[0].compiledId
    return
  }
  applyDefaultDiffBaselineSelection(selectedCompiledId.value)
}

onMounted(() => {
  trackReportSectionEnter(activeReportSection.value, 'initial')
  refresh()
})

onBeforeUnmount(() => {
  trackReportSectionLeave(activeReportSection.value, 'unmount')
})

watch(
  manualCompileInputKey,
  (nextKey) => {
    if (!compileManualSaveEnabled) return
    compileWorkflow.setCurrentInputKey(nextKey)
  },
  { immediate: true }
)

watch(availableLabels, (labels) => {
  if (!labels.includes(activeLabel.value)) {
    activeLabel.value = (labels[0] ?? 'teams') as
      | 'teams'
      | 'speakers'
      | 'adjudicators'
      | 'poi'
      | 'best'
  }
  if (!labels.includes(slideLabel.value)) {
    persistSlideLabel((labels[0] ?? 'teams') as CompiledLabel)
  }
})

watch(
  tableColumns,
  (columns) => {
    if (!columns.includes(resultSortKey.value)) {
      resultSortKey.value = columns.includes('ranking') ? 'ranking' : columns[0] ?? 'ranking'
      resultSortDirection.value = resultSortKey.value === 'ranking' ? 'asc' : 'desc'
    }
  },
  { immediate: true }
)

watch(
  selectedCompiledId,
  (nextId) => {
    if (!nextId) return
    applyCompiledSnapshot(nextId)
    applyDefaultDiffBaselineSelection(nextId)
  }
)

watch(
  baselineCompiledOptions,
  (options) => {
    if (options.length === 0) {
      selectedCompiledId.value = ''
      return
    }
    const exists = options.some((option) => option.compiledId === selectedCompiledId.value)
    if (!exists) {
      selectedCompiledId.value = options[0].compiledId
    }
  },
  { immediate: true }
)

watch(
  diffBaselineCompiledOptions,
  (options) => {
    const current = String(compileDiffBaselineSelection.value).trim()
    if (options.length === 0) {
      compileDiffBaselineSelection.value = ''
      return
    }
    if (!current) {
      applyDefaultDiffBaselineSelection()
      return
    }
    const exists = options.some((option) => option.compiledId === current)
    if (!exists) {
      applyDefaultDiffBaselineSelection()
    }
  },
  { immediate: true }
)

watch(tournamentId, () => {
  compileExecuted.value = false
  compileDefaultsHydrated.value = false
  manualCompileSource.value = 'submissions'
  manualCompileOptionOverrides.value = undefined
  closeDeleteCompiledModal()
  compileWorkflow.clearPreview()
  compiledStore.clearPreview()
  refresh()
})

function buildSubPrizeResults(kind: 'poi' | 'best') {
  if (!compiled.value) return []
  if (!isCompileLabelEnabled(kind)) return []
  return buildSubPrizeResultsFromCompiled(compiled.value, kind)
}
</script>

<style scoped>
.report-content-shell {
  position: relative;
  min-height: 120px;
}

.reload-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface) 75%, transparent);
  pointer-events: none;
}

.error {
  color: var(--color-danger);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  z-index: 40;
}

.modal {
  width: min(560px, 100%);
  max-height: calc(100vh - 80px);
  overflow: auto;
}

.modal-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.section-header {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(1.55rem, 1.9vw, 1.92rem);
  line-height: 1.2;
  letter-spacing: 0.01em;
  font-weight: 750;
}

.header-reload {
  margin-left: var(--space-2);
}

.warning {
  color: var(--color-warn);
}

.grow {
  flex: 1;
}

.compile-card {
  gap: var(--space-3);
}

.compile-card-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.report-setup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-3);
}

.report-setup-card {
  gap: var(--space-3);
}

.report-setup-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.report-snapshot-table {
  overflow-x: auto;
}

.report-snapshot-actions {
  gap: var(--space-1);
  flex-wrap: wrap;
}

.report-generate-block {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
  gap: var(--space-3);
}

.submission-summary-card {
  gap: var(--space-3);
}

.overview-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  display: grid;
  gap: 6px;
}

.overview-value {
  margin: 0;
  color: var(--color-text);
  font-weight: 650;
  line-height: 1.45;
}

.overview-inline-link {
  width: fit-content;
}

.overview-status-row {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.overview-status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
}

.overview-status-ok {
  color: #166534;
  background: #dcfce7;
  border: 1px solid #86efac;
}

.overview-status-warn {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}

.overview-status-danger {
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fca5a5;
}

.report-section-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.report-section-nav {
  gap: var(--space-2);
}

.report-section-nav-head {
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.report-section-active-note {
  margin: 0;
}

.report-section-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  min-height: 34px;
  padding: 0 14px;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
}

.report-section-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.report-section-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.operations-results {
  order: 1;
}

.rankings-panel {
  gap: var(--space-3);
}

.ranking-category-tabs {
  margin-top: 2px;
}

.strictness-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
}

.strictness-head {
  align-items: center;
  text-align: center;
  gap: var(--space-1);
}

.strictness-subtitle {
  margin: 0;
}

.fairness-panel-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.fairness-chart-card {
  gap: var(--space-2);
}

.strictness-bar-track {
  position: relative;
  width: 140px;
  height: 10px;
  border-radius: 999px;
  background: #f1f5f9;
  overflow: hidden;
}

.strictness-bar-center {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 100%;
  background: #94a3b8;
  transform: translateX(-0.5px);
}

.strictness-bar-fill {
  position: absolute;
  top: 1px;
  height: 8px;
  border-radius: 999px;
}

.strictness-bar-strict {
  background: #f59e0b;
}

.strictness-bar-lenient {
  background: #3b82f6;
}

.strictness-bar-neutral {
  background: #94a3b8;
}

.fairness-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-2);
}

.fairness-round-visual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.fairness-round-visual-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
}

.fairness-analysis {
  gap: var(--space-2);
}

.fairness-severity {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
}

.fairness-severity-high {
  color: #991b1b;
  background: #fee2e2;
  border: 1px solid #fca5a5;
}

.fairness-severity-medium {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
}

.fairness-severity-low {
  color: #166534;
  background: #dcfce7;
  border: 1px solid #86efac;
}

.snapshot-selector-row {
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.recompute-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.compile-field {
  gap: var(--space-2);
}

.source-primary-row {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.source-help {
  margin: 0;
}

.source-advanced-toggle {
  justify-content: flex-start;
}

.raw-source-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 700;
}

.compile-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.compile-field-wide {
  grid-column: 1 / -1;
}

.compile-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  gap: var(--space-2);
}

.compile-summary-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  color: var(--color-text);
}

.submission-summary {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
}

.submission-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.submission-summary-header {
  align-items: center;
  gap: var(--space-2);
}

.submission-summary-actions {
  margin-left: auto;
  align-items: center;
  gap: var(--space-2);
}

.submission-link:hover {
  text-decoration: underline;
}

.compile-warning-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
}

.migration-guide {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  gap: var(--space-2);
}

.migration-guide-list {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}

.migration-guide-actions {
  gap: var(--space-2);
  flex-wrap: wrap;
}

.migration-guide-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: 0.85rem;
}

.migration-guide-link:hover {
  text-decoration: underline;
}

.raw-source-notice {
  margin: 0;
}

.compile-actions {
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.report-modal {
  gap: var(--space-3);
}

.recompute-modal {
  width: min(980px, 100%);
}

.delete-compiled-modal {
  width: min(540px, 100%);
}

.report-modal-head {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  background: var(--color-surface);
  font-size: 14px;
}

.pill input {
  margin: 0;
}

.ranking-priority-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-muted);
}

.ranking-priority-item {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.label-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.compile-category-inline {
  gap: var(--space-2);
}

.compile-diff-controls {
  align-items: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.compile-diff-field {
  min-width: 180px;
  gap: 4px;
}

.compile-diff-field-wide {
  min-width: min(460px, 100%);
}

.result-list-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.result-list-actions {
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.section-download-row {
  justify-content: flex-end;
}

.section-download-button {
  width: 100%;
  justify-content: center;
}

.diff-legend {
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.diff-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-muted);
}

.diff-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.diff-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  font-size: 12px;
  font-weight: 700;
}

.diff-improved {
  color: var(--color-success);
}

.diff-worsened {
  color: var(--color-danger);
}

.diff-unchanged,
.diff-na {
  color: var(--color-muted);
}

.diff-new {
  color: var(--color-primary);
}

.diff-delta {
  font-size: 12px;
}

.label-tab {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  min-height: 34px;
  padding: 0 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.label-tab:hover {
  border-color: #bfdbfe;
  color: var(--color-primary);
}

.label-tab.active {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

@media (max-width: 980px) {
  .fairness-round-visual-grid {
    grid-template-columns: 1fr;
  }
}

.wrap {
  flex-wrap: wrap;
}

.announcement-panel {
  gap: var(--space-3);
}

.announcement-block {
  gap: var(--space-3);
}

.slide-settings-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.slide-settings-main {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: var(--space-2);
  flex-wrap: wrap;
  flex: 0 1 auto;
}

.slide-setting-field {
  gap: var(--space-1);
}

.slide-setting-field-compact {
  min-width: 120px;
  max-width: 170px;
}

.slide-settings-credits {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  flex: 1 1 460px;
  min-width: min(460px, 100%);
}

.slide-setting-field-credit {
  min-width: 0;
}

.slide-setting-field-credit input {
  width: 100%;
}

@media (max-width: 760px) {
  .slide-settings-credits {
    grid-template-columns: 1fr;
    min-width: 100%;
  }
}

.award-copy-toolbar {
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.award-copy-text {
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
  white-space: pre-wrap;
  line-height: 1.65;
  max-height: 360px;
  overflow: auto;
}

textarea {
  width: 100%;
}
</style>
