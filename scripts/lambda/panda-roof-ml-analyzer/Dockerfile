# Panda Roof ML Analyzer Lambda
# ==============================
# Container image for roof segmentation and edge detection

FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies for image processing and compilation
RUN yum install -y \
    libjpeg-turbo-devel \
    zlib-devel \
    gcc \
    gcc-c++ \
    python3-devel \
    && yum clean all

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy handler
COPY handler.py ${LAMBDA_TASK_ROOT}/

# Set handler
CMD [ "handler.handler" ]
