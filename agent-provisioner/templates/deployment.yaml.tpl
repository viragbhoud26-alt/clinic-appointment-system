apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{SERVICE}}
  namespace: {{NAMESPACE}}
  labels:
    app: {{SERVICE}}
    provisioned-by: ai-agent-provisioner
spec:
  replicas: {{REPLICAS}}
  selector:
    matchLabels:
      app: {{SERVICE}}
  template:
    metadata:
      labels:
        app: {{SERVICE}}
    spec:
      containers:
        - name: {{SERVICE}}
          image: {{IMAGE}}
          imagePullPolicy: Never
          resources:
            requests:
              cpu: "{{CPU}}"
              memory: "{{MEMORY}}"
            limits:
              cpu: "{{CPU}}"
              memory: "{{MEMORY}}"
