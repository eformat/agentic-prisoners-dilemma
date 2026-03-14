{{- define "prisoners-dilemma.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "prisoners-dilemma.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "prisoners-dilemma.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "prisoners-dilemma.name" . }}
{{- end }}

{{- define "prisoners-dilemma.backend.labels" -}}
{{ include "prisoners-dilemma.labels" . }}
app.kubernetes.io/name: {{ include "prisoners-dilemma.fullname" . }}-backend
app.kubernetes.io/component: backend
{{- end }}

{{- define "prisoners-dilemma.frontend.labels" -}}
{{ include "prisoners-dilemma.labels" . }}
app.kubernetes.io/name: {{ include "prisoners-dilemma.fullname" . }}-frontend
app.kubernetes.io/component: frontend
{{- end }}

{{- define "prisoners-dilemma.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "prisoners-dilemma.fullname" . }}-backend
app.kubernetes.io/component: backend
{{- end }}

{{- define "prisoners-dilemma.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "prisoners-dilemma.fullname" . }}-frontend
app.kubernetes.io/component: frontend
{{- end }}
