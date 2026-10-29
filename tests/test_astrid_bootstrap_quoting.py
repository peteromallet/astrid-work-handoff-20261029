import json
import re
from runpod.api.mutations.pods import generate_pod_deployment_mutation


def test_docker_args_are_a_single_escaped_graphql_string():
    command = "bash -lc \"exec python3 -c 'print(\\\"hello\\\")'\"\n"
    query = generate_pod_deployment_mutation(name="test", image_name="runpod/base:latest", gpu_type_id="gpu", docker_args=command)
    encoded = re.search(r'dockerArgs: ("(?:[^"\\]|\\.)*")', query)[1]
    assert json.loads(encoded) == command
